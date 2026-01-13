const logger = require('./logger');
const e = require('../../storage/emojis');
const { PermissionFlagsBits } = require('discord.js');
const VerifiedUser = require('../models/verifiedUser');
const axios = require('axios');

async function refreshDiscordToken(user) {
  if (!user.discordRefreshToken) return null;
  
  try {
    const tokenForm = new URLSearchParams();
    tokenForm.append('client_id', process.env.DISCORD_CLIENT_ID);
    tokenForm.append('client_secret', process.env.DISCORD_CLIENT_SECRET);
    tokenForm.append('grant_type', 'refresh_token');
    tokenForm.append('refresh_token', user.discordRefreshToken);
    
    const tokenRes = await axios.post('https://discord.com/api/oauth2/token', tokenForm.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    
    if (tokenRes.data.access_token) {
      user.discordAccessToken = tokenRes.data.access_token;
      user.discordRefreshToken = tokenRes.data.refresh_token || user.discordRefreshToken;
      user.discordTokenExpiry = new Date(Date.now() + (tokenRes.data.expires_in * 1000));
      await user.save();
      return tokenRes.data.access_token;
    }
  } catch (err) {
    logger.warn('Token refresh failed', { discordId: user.discordId, error: err.message });
  }
  return null;
}

async function sendDMViaOAuth(discordId, messageOptions, context = 'unknown') {
  try {
    const user = await VerifiedUser.findOne({ discordId });
    
    if (!user || !user.discordAccessToken) {
      return { success: false, method: 'oauth', error: 'No OAuth token available' };
    }

    if (user.discordTokenExpiry && new Date() > user.discordTokenExpiry) {
      logger.info(`[DM-OAUTH-${context}] Token expired, attempting refresh`, { discordId });
      const newToken = await refreshDiscordToken(user);
      if (!newToken) {
        logger.warn(`[DM-OAUTH-${context}] Token refresh failed`, { discordId });
        return { success: false, method: 'oauth', error: 'Token expired and refresh failed' };
      }
      logger.info(`[DM-OAUTH-${context}] Token refreshed successfully`, { discordId });
    }

    const dmChannel = await axios.post('https://discord.com/api/v10/users/@me/channels', {
      recipient_id: discordId
    }, {
      headers: {
        'Authorization': `Bearer ${user.discordAccessToken}`,
        'Content-Type': 'application/json'
      }
    });

    const channelId = dmChannel.data.id;

    let content = '';
    let embeds = [];
    
    if (messageOptions.components && messageOptions.components.length > 0) {
      const container = messageOptions.components[0];
      if (container.data && container.data.components) {
        const textComponents = container.data.components.filter(c => c.type === 1);
        content = textComponents.map(c => c.content).join('\n') || `${e.success} Verification complete.`;
      }
    } else if (messageOptions.content) {
      content = messageOptions.content;
    }

    await axios.post(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      content: content || `${e.success} Verification complete.`
    }, {
      headers: {
        'Authorization': `Bearer ${user.discordAccessToken}`,
        'Content-Type': 'application/json'
      }
    });

    logger.info(`[DM-OAUTH-${context}] Direct message sent via OAuth`, { discordId });
    return { success: true, method: 'oauth' };

  } catch (err) {
    logger.warn(`[DM-OAUTH-${context}] OAuth DM failed`, { 
      discordId, 
      error: err.message,
      status: err.response?.status
    });
    return { success: false, method: 'oauth', error: err.message };
  }
}

async function safeSendDM(member, messageOptions, config = {}, context = 'unknown') {
  const discordId = member.user.id;
  const guildId = member.guild.id;
  
  const oauthResult = await sendDMViaOAuth(discordId, messageOptions, context);
  if (oauthResult.success) {
    return { success: true, dmSent: true, fallbackSent: false, method: 'oauth' };
  }
  
  try {

    const dmChannel = await member.createDM(true).catch(err => {
      logger.debug(`[DM-${context}] Unable to create DM channel`, {
        discordId,
        guildId,
        error: err.message,
        code: err.code
      });
      return null;
    });

    if (dmChannel) {
      await dmChannel.send(messageOptions).catch(err => {
        logger.debug(`[DM-${context}] Unable to send via DM channel`, {
          discordId,
          guildId,
          error: err.message,
          code: err.code
        });
        throw err;
      });

      logger.info(`[DM-${context}] Direct message sent`, {
        discordId,
        guildId
      });

      return { success: true, dmSent: true, fallbackSent: false, method: 'bot' };
    }
  } catch (dmErr) {
    logger.warn(`[DM-${context}] Unable to deliver direct message`, {
      discordId,
      guildId,
      error: dmErr.message,
      code: dmErr.code,
      errorType: dmErr.constructor?.name
    });

    if (config.fallbackChannelId) {
      try {
        const fallbackChannel = member.guild.channels.cache.get(config.fallbackChannelId);
        
        if (fallbackChannel && fallbackChannel.permissionsFor(member.guild.members.me)?.has(PermissionFlagsBits.SendMessages)) {
          const fallbackMessage = config.fallbackMessage || 
            `${member} — ${e.success} Your action in **${member.guild.name}** is complete. ${e.denied} A direct message could not be delivered. Please enable DMs from this server.`;

          await fallbackChannel.send({
            content: fallbackMessage,
            allowedMentions: { parse: [] }
          }).catch(err => {
            logger.debug(`[DM-FALLBACK-${context}] Unable to send fallback notification`, {
              discordId,
              guildId,
              error: err.message
            });
          });

          logger.info(`[DM-FALLBACK-${context}] Fallback notification sent`, {
            discordId,
            guildId,
            channelId: config.fallbackChannelId
          });

          return { success: true, dmSent: false, fallbackSent: true, method: 'fallback' };
        }
      } catch (fallbackErr) {
        logger.debug(`[DM-FALLBACK-${context}] Unable to send fallback notification`, {
          discordId,
          guildId,
          error: fallbackErr.message
        });
      }
    }

    return { 
      success: false, 
      dmSent: false, 
      fallbackSent: false, 
      error: dmErr.message 
    };
  }
}

async function safeSendDMWithRetry(member, messageOptions, config = {}, context = 'unknown', retries = 1) {
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await safeSendDM(member, messageOptions, config, `${context}-attempt${attempt + 1}`);
      if (result.success) {
        return result;
      }
      lastError = result.error;
    } catch (err) {
      lastError = err.message;
      
      if (attempt < retries) {
        const delay = Math.pow(2, attempt) * 100;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  return {
    success: false,
    dmSent: false,
    fallbackSent: false,
    error: lastError || 'Unknown error'
  };
}

module.exports = {
  safeSendDM,
  safeSendDMWithRetry,
  sendDMViaOAuth
};
