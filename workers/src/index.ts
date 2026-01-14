import { Hono } from 'hono'
import { cors } from 'hono/cors'
type Env = {
  DISCORD_CLIENT_ID: string
  DISCORD_CLIENT_SECRET: string
  ROBLOX_CLIENT_ID: string
  ROBLOX_CLIENT_SECRET: string
  ROBLOX_REDIRECT_URI: string
  VERIFY_WEBHOOK_URL: string
  VERIFY_WEBHOOK_SECRET: string
  LUMI_API_URL: string
  VIEWS_KV: KVNamespace
  DISCORD_REDIRECT_URI_UNLINK: string
  UNLINK_WEBHOOK_URL: string
}

function jsonError(c: any, status: number, message: string, meta: Record<string, any> = {}) {
  console.error('[worker-error]', { message, status, ...meta })
  return c.json({ error: message, status }, status)
}

async function safeFetch(input: RequestInfo | URL, init?: RequestInit) {
  try {
    const res = await fetch(input, init)
    return res
  } catch (e: any) {
    console.error('[fetch-error]', e?.message || e)
    throw new Error(`Network error: ${e.message}`)
  }
}

function parseState(raw: string | null): { discordId: string | null; guildId: string | null; nonce: string | null; sessionId: string | null } {
  if (!raw) return { discordId: null, guildId: null, nonce: null, sessionId: null }
  const parts = raw.split(':')
  return {
    discordId: parts[0] || null,
    guildId: parts[1] || null,
    nonce: parts[2] || null,
    sessionId: parts[3] || null
  }
}

const app = new Hono<{ Bindings: Env }>()
const sessionStore = new Map<string, string>()
function normalizeWebhookUrl(url: string | undefined) {
  if (!url) return url
  return url.replace('/api/verify/complete', '/lumi/verify/complete').replace('/verify/complete', '/lumi/verify/complete')
}
app.use('*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'OPTIONS'], allowHeaders: ['Content-Type', 'Authorization'] }))


app.post('/portfolio/views/:page', async (c) => {
  try {
    if (!c.env.VIEWS_KV) return jsonError(c, 500, 'VIEWS_KV not configured')

    const page = c.req.param('page')
    if (!page) return jsonError(c, 400, 'Missing page')

    let visitorId: string | null = null
    try {
      const body = await c.req.json<{ visitorId?: string }>()
      visitorId = body?.visitorId || null
    } catch {}

    if (!visitorId || visitorId.length > 120) return jsonError(c, 400, 'Missing or invalid visitorId')

    const seenKey = `views:${page}:seen:${visitorId}`
    const totalKey = `views:${page}:total`
    const ttlSeconds = 60 * 60 * 24 * 365 // 1 year

    const [seen, totalRaw] = await Promise.all([
      c.env.VIEWS_KV.get(seenKey),
      c.env.VIEWS_KV.get(totalKey)
    ])

    let total = parseInt(totalRaw || '0', 10)
    if (Number.isNaN(total) || total < 0) total = 0

    if (!seen) {
      total += 1
      await Promise.all([
        c.env.VIEWS_KV.put(seenKey, '1', { expirationTtl: ttlSeconds }),
        c.env.VIEWS_KV.put(totalKey, total.toString())
      ])
    }

    return c.json({ views: total })
  } catch (err: any) {
    console.error('[portfolio-views] fatal', err)
    return jsonError(c, 500, 'Internal error', { error: err?.message })
  }
})

app.get('/unlink/start', (c) => {

  const state = `unlink:${crypto.randomUUID()}`
  
  const params = new URLSearchParams({
    client_id: c.env.DISCORD_CLIENT_ID,
    redirect_uri: c.env.DISCORD_REDIRECT_URI_UNLINK || `${new URL(c.req.url).origin}/unlink/callback`,
    response_type: 'code',
    scope: 'identify',
    state
  })
  
  const redirectUrl = `https://discord.com/api/oauth2/authorize?${params}`
  return c.redirect(redirectUrl)
})

app.get('/unlink/callback', async (c) => {
  try {
    const code = c.req.query('code')
    const state = c.req.query('state')
    
    if (!code) return jsonError(c, 400, 'Missing OAuth code')
    if (!state || !state.startsWith('unlink:')) return jsonError(c, 400, 'Invalid state')

    const tokenForm = new URLSearchParams({
      client_id: c.env.DISCORD_CLIENT_ID,
      client_secret: c.env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: c.env.DISCORD_REDIRECT_URI_UNLINK || `${new URL(c.req.url).origin}/unlink/callback`
    })
    
    const tokenRes = await safeFetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenForm.toString()
    })
    
    if (!tokenRes.ok) {
      console.error('[unlink] Discord token exchange failed:', tokenRes.status)
      return jsonError(c, 500, 'Failed to authenticate with Discord')
    }
    
    const tokenData = await tokenRes.json() as { access_token?: string }
    if (!tokenData.access_token) return jsonError(c, 500, 'Missing access token')

    const userRes = await safeFetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    })
    
    if (!userRes.ok) {
      console.error('[unlink] Discord user fetch failed:', userRes.status)
      return jsonError(c, 500, 'Failed to fetch Discord user')
    }
    
    const user = await userRes.json() as { id?: string; username?: string; avatar?: string }
    if (!user.id) return jsonError(c, 500, 'Missing Discord user ID')

    const unlinkPayload = {
      discordId: user.id,
      isSynthetic: false
    }
    
    const lumiApiUrl = c.env.LUMI_API_URL || 'http://65.21.16.214:2052'
    const defaultWebhookUrl = `${lumiApiUrl}/lumi/unlink/complete`
    const rawWebhookUrl = c.env.UNLINK_WEBHOOK_URL
    const webhookUrl = normalizeWebhookUrl(rawWebhookUrl) || defaultWebhookUrl
    
    let webhookRes
    try {
      const headers = new Headers()
      headers.set('Content-Type', 'application/json')
      headers.set('X-Verify-Secret', c.env.VERIFY_WEBHOOK_SECRET || 'TrizlyDEVKEY999')
      
      webhookRes = await safeFetch(webhookUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(unlinkPayload)
      })
    } catch (e: any) {
      console.error('🔥 Unlink webhook fetch error:', e.message)
    }

    const avatarUrl = user.avatar 
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256`
      : 'https://cdn.discordapp.com/embed/avatars/0.png'
    
    const redirect = new URL('https://trizly.xyz/unlink/success')
    redirect.searchParams.set('avatar', avatarUrl)
    redirect.searchParams.set('username', user.username || 'Unknown')
    redirect.searchParams.set('userId', user.id)
    
    return c.redirect(redirect.toString(), 302)
    
  } catch (err: any) {
    console.error('🔥 [unlink-callback] FATAL ERROR', err)
    return jsonError(c, 500, 'Fatal error during unlink', { error: err.message })
  }
})

app.post('/unlink/:discordId', async (c) => {
  try {
    const discordId = c.req.param('discordId')
    if (!discordId) return jsonError(c, 400, 'Missing discordId')

    const snowflake = /^\d{17,19}$/
    if (!snowflake.test(discordId)) return jsonError(c, 400, 'Invalid Discord ID format')

    const authHeader = c.req.header('Authorization')
    const secret = c.req.header('X-Verify-Secret')
    
    if (!authHeader && !secret) {
      return jsonError(c, 401, 'Missing authentication')
    }

    if (secret && secret !== c.env.VERIFY_WEBHOOK_SECRET) {
      return jsonError(c, 403, 'Invalid authentication')
    }

    const unlinkPayload = {
      discordId,
      isSynthetic: false
    }
    
    const lumiApiUrl = c.env.LUMI_API_URL || 'http://65.21.16.214:2052'
    const defaultWebhookUrl = `${lumiApiUrl}/lumi/unlink/complete`
    const rawWebhookUrl = c.env.UNLINK_WEBHOOK_URL
    const webhookUrl = normalizeWebhookUrl(rawWebhookUrl) || defaultWebhookUrl
    
    const headers = new Headers()
    headers.set('Content-Type', 'application/json')
    headers.set('X-Verify-Secret', c.env.VERIFY_WEBHOOK_SECRET || 'TrizlyDEVKEY999')
    
    const webhookRes = await safeFetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(unlinkPayload)
    })
    
    if (!webhookRes.ok) {
      const errorText = await webhookRes.text()
      console.error('[unlink] Webhook error:', errorText)
      return jsonError(c, 500, 'Failed to process unlink')
    }
    
    const result = await webhookRes.json()
    return c.json({ status: 'ok', message: 'User unlinked successfully', data: result })
    
  } catch (err: any) {
    console.error('[unlink-api] error:', err)
    return jsonError(c, 500, 'Internal error', { error: err.message })
  }
})

// Proxy /lookup/* requests to origin API server
app.get('/lookup/discord/:discordId', async (c) => {
  try {
    const discordId = c.req.param('discordId')
    if (!discordId || !/^\d{17,19}$/.test(discordId)) {
      return jsonError(c, 400, 'Invalid Discord ID format')
    }

    const apiUrl = c.env.LUMI_API_URL || 'http://localhost:3000'
    const response = await safeFetch(`${apiUrl}/lumi/lookup/discord/${discordId}`)
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('[lookup-discord] Origin API error:', { status: response.status, error: errorText })
      return jsonError(c, response.status, errorText || 'Lookup failed')
    }

    const data = await response.json()
    return c.json(data)
  } catch (err: any) {
    console.error('[lookup-discord] fatal', err)
    return jsonError(c, 500, 'Internal error', { error: err?.message })
  }
})

app.get('/lookup/roblox/:identifier', async (c) => {
  try {
    const identifier = c.req.param('identifier')
    if (!identifier) {
      return jsonError(c, 400, 'Missing identifier')
    }

    const apiUrl = c.env.LUMI_API_URL || 'http://localhost:3000'
    const response = await safeFetch(`${apiUrl}/lumi/lookup/roblox/${encodeURIComponent(identifier)}`)
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('[lookup-roblox] Origin API error:', { status: response.status, error: errorText })
      return jsonError(c, response.status, errorText || 'Lookup failed')
    }

    const data = await response.json()
    return c.json(data)
  } catch (err: any) {
    console.error('[lookup-roblox] fatal', err)
    return jsonError(c, 500, 'Internal error', { error: err?.message })
  }
})

// Proxy /lumi/health to origin API server
app.get('/lumi/health', async (c) => {
  try {
    const apiUrl = c.env.LUMI_API_URL || 'http://localhost:3000'
    const response = await safeFetch(`${apiUrl}/health`)
    
    if (!response.ok) {
      return jsonError(c, 502, 'Origin API health check failed')
    }

    const data = await response.json()
    return c.json(data)
  } catch (err: any) {
    console.error('[lumi-health] fatal', err)
    return jsonError(c, 500, 'Internal error', { error: err?.message })
  }
})

// Proxy /lumi/verify/complete to origin API server (webhook endpoint)
app.post('/lumi/verify/complete', async (c) => {
  try {
    const apiUrl = c.env.LUMI_API_URL || 'http://localhost:3000'
    const body = await c.req.text()
    
    const response = await safeFetch(`${apiUrl}/lumi/verify/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Verify-Secret': c.req.header('X-Verify-Secret') || ''
      },
      body
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('[lumi-verify-complete] Origin API error:', { status: response.status, error: errorText })
      return jsonError(c, response.status, errorText || 'Verification completion failed')
    }

    const data = await response.json()
    return c.json(data)
  } catch (err: any) {
    console.error('[lumi-verify-complete] fatal', err)
    return jsonError(c, 500, 'Internal error', { error: err?.message })
  }
})

// Proxy /lumi/unlink/complete to origin API server (webhook endpoint)
app.post('/lumi/unlink/complete', async (c) => {
  try {
    const apiUrl = c.env.LUMI_API_URL || 'http://localhost:3000'
    const body = await c.req.text()
    
    const response = await safeFetch(`${apiUrl}/lumi/unlink/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Verify-Secret': c.req.header('X-Verify-Secret') || ''
      },
      body
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('[lumi-unlink-complete] Origin API error:', { status: response.status, error: errorText })
      return jsonError(c, response.status, errorText || 'Unlink completion failed')
    }

    const data = await response.json()
    return c.json(data)
  } catch (err: any) {
    console.error('[lumi-unlink-complete] fatal', err)
    return jsonError(c, 500, 'Internal error', { error: err?.message })
  }
})

// /lumi/* requests (lookups, etc.) fall through to origin server (API Hub)
// Worker only handles OAuth flows that need secrets

// Alias /lumi/* routes to root handlers for compatibility with hub proxy format
app.post('/lumi/verify/callback', async (c) => {
  let body: { code?: string; state?: string } = {}
  try { body = await c.req.json() } catch (e) { console.error('[lumi-discord-callback] Failed to parse JSON body:', e) }
  const { code, state } = body
  if (!code) return jsonError(c, 400, 'Missing Discord OAuth code')
  if (!state) return jsonError(c, 400, 'Missing state')
  const { discordId, guildId } = parseState(state)
  if (!discordId || !guildId) return jsonError(c, 400, 'Invalid state format (expected discordId:guildId)', { state })
  const discordIdRegex = /^\d{17,19}$/
  if (!discordIdRegex.test(discordId) || !discordIdRegex.test(guildId)) return jsonError(c, 400, 'Invalid Discord ID format')
  
  // Reuse verify callback logic by redirecting to root handler
  const newReq = new Request(new URL('/verify/callback', c.req.url), {
    method: 'POST',
    headers: c.req.raw.headers,
    body: JSON.stringify(body)
  })
  return app.fetch(newReq)
})

app.get('/lumi/verify/callback', async (c) => {
  const url = new URL(c.req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!code) return jsonError(c, 400, 'Missing Discord OAuth code')
  if (!state) return jsonError(c, 400, 'Missing state')
  const { discordId, guildId } = parseState(state)
  if (!discordId || !guildId) return jsonError(c, 400, 'Invalid state format (expected discordId:guildId)', { state })
  const discordIdRegex = /^\d{17,19}$/
  if (!discordIdRegex.test(discordId) || !discordIdRegex.test(guildId)) return jsonError(c, 400, 'Invalid Discord ID format')
  
  const nonce = crypto.randomUUID().slice(0, 8)
  const enrichedState = `${discordId}:${guildId}:${nonce}`
  const origin = new URL(c.req.url).origin
  const nextRobloxStartUrl = `${origin}/lumi/verify/roblox/start?state=${encodeURIComponent(enrichedState)}`
  return c.redirect(nextRobloxStartUrl, 302)
})

app.get('/lumi/verify/roblox/start', (c) => {
  let state: string | null = c.req.query('state') || null
  if (!state || state === 'undefined' || state === 'null' || state === 'NaN') state = null
  if (!state) {
    const sessionParam = c.req.query('session')
    if (sessionParam && sessionParam !== 'undefined' && sessionParam !== 'null' && sessionParam !== 'NaN') {
      const mapped = sessionStore.get(sessionParam)
      if (mapped) state = mapped
    }
  }

  if (!state) {
    console.error('[lumi-roblox-start] missing state; user must start from Discord OAuth')
    return jsonError(c, 400, 'Missing state; start verification from Discord')
  }

  const parsed = parseState(state)
  if (!parsed.discordId || !parsed.guildId) {
    console.error('[lumi-roblox-start] invalid state; user must start from Discord OAuth', { state, parsed })
    return jsonError(c, 400, 'Invalid state; start verification from Discord')
  }
  const params = new URLSearchParams({ client_id: c.env.ROBLOX_CLIENT_ID, response_type: 'code', redirect_uri: c.env.ROBLOX_REDIRECT_URI, scope: 'openid profile', state })
  const redirectUrl = `https://apis.roblox.com/oauth/v1/authorize?${params}`
  return c.redirect(redirectUrl)
})

app.get('/lumi/verify/roblox/callback', async (c) => {
  const url = new URL(c.req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  if (!code) return jsonError(c, 400, "Missing code")
  if (!state) return jsonError(c, 400, "Missing state")

  const { discordId, guildId, sessionId } = parseState(state)

  if (!discordId || !guildId) {
    return jsonError(c, 400, "Invalid state", { state })
  }

  const snowflake = /^\d{17,19}$/
  if (!snowflake.test(discordId) || !snowflake.test(guildId)) {
    return jsonError(c, 400, "Invalid Discord ID")
  }

  let discordTokens: any = null
  if (sessionId) {
    const tokenStr = sessionStore.get(`token_${sessionId}`)
    if (tokenStr) {
      try {
        discordTokens = JSON.parse(tokenStr)
        sessionStore.delete(`token_${sessionId}`)
      } catch (e) {
        console.error('[lumi-roblox-callback] Failed to parse stored Discord tokens:', e)
      }
    }
  }

  try {
    const form = new URLSearchParams()
    form.append("grant_type", "authorization_code")
    form.append("code", code)
    form.append("redirect_uri", c.env.ROBLOX_REDIRECT_URI)

    const basic = btoa(`${c.env.ROBLOX_CLIENT_ID}:${c.env.ROBLOX_CLIENT_SECRET}`)

    const tokenRes = await safeFetch("https://apis.roblox.com/oauth/v1/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "Accept": "application/json",
        "Authorization": `Basic ${basic}`
      },
      body: form.toString()
    })

    if (!tokenRes.ok) return jsonError(c, 500, "Roblox token exchange failed")

    const tokenData = await tokenRes.json() as { access_token?: string }
    if (!tokenData.access_token) return jsonError(c, 500, "Roblox token missing")

    const userRes = await safeFetch("https://apis.roblox.com/oauth/v1/userinfo", {
      headers: { "Authorization": `Bearer ${tokenData.access_token}` }
    })

    if (!userRes.ok) return jsonError(c, 500, "Roblox user fetch failed")

    const user = await userRes.json() as any

    const payload: any = {
      discordId,
      guildId,
      robloxId: user.sub,
      robloxUsername: user.name,
      isSynthetic: false
    }

    const lumiApiUrl = c.env.LUMI_API_URL || 'http://65.21.16.214:2052'
    const webhookUrl = c.env.VERIFY_WEBHOOK_URL || `${lumiApiUrl}/lumi/verify/complete`

    await safeFetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Verify-Secret": c.env.VERIFY_WEBHOOK_SECRET
      },
      body: JSON.stringify(payload)
    }).catch(e => console.error('[lumi-roblox-callback] Webhook error:', e.message))

    const redirect = new URL("https://trizly.xyz/verify/success")
    redirect.searchParams.set("avatar", user.picture || "")
    redirect.searchParams.set("displayName", user.name || "")
    redirect.searchParams.set("username", user.preferred_username || "")
    redirect.searchParams.set("userId", user.sub || "")

    return c.redirect(redirect.toString(), 302)
  } catch (err: any) {
    console.error("🔥 [lumi-roblox-callback] FATAL ERROR", err)
    return jsonError(c, 500, "Fatal error", { error: err.message })
  }
})

app.get('/lumi/unlink/start', (c) => {
  const state = `unlink:${crypto.randomUUID()}`
  const params = new URLSearchParams({
    client_id: c.env.DISCORD_CLIENT_ID,
    redirect_uri: c.env.DISCORD_REDIRECT_URI_UNLINK || `${new URL(c.req.url).origin}/lumi/unlink/callback`,
    response_type: 'code',
    scope: 'identify',
    state
  })
  const redirectUrl = `https://discord.com/api/oauth2/authorize?${params}`
  return c.redirect(redirectUrl)
})

app.get('/lumi/unlink/callback', async (c) => {
  const url = new URL(c.req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  
  if (!code) return jsonError(c, 400, 'Missing OAuth code')
  if (!state || !state.startsWith('unlink:')) return jsonError(c, 400, 'Invalid state')

  const tokenForm = new URLSearchParams({
    client_id: c.env.DISCORD_CLIENT_ID,
    client_secret: c.env.DISCORD_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: c.env.DISCORD_REDIRECT_URI_UNLINK || `${new URL(c.req.url).origin}/lumi/unlink/callback`
  })
  
  try {
    const tokenRes = await safeFetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenForm.toString()
    })
    
    if (!tokenRes.ok) return jsonError(c, 500, 'Failed to authenticate with Discord')
    
    const tokenData = await tokenRes.json() as { access_token?: string }
    if (!tokenData.access_token) return jsonError(c, 500, 'Missing access token')

    const userRes = await safeFetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    })
    
    if (!userRes.ok) return jsonError(c, 500, 'Failed to fetch Discord user')
    
    const user = await userRes.json() as { id?: string; username?: string; avatar?: string }
    if (!user.id) return jsonError(c, 500, 'Missing Discord user ID')

    const unlinkPayload = { discordId: user.id, isSynthetic: false }
    const lumiApiUrl = c.env.LUMI_API_URL || 'http://65.21.16.214:2052'
    const webhookUrl = c.env.UNLINK_WEBHOOK_URL || `${lumiApiUrl}/lumi/unlink/complete`
    
    await safeFetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Verify-Secret': c.env.VERIFY_WEBHOOK_SECRET
      },
      body: JSON.stringify(unlinkPayload)
    }).catch(e => console.error('[lumi-unlink] Webhook error:', e.message))

    const avatarUrl = user.avatar 
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256`
      : 'https://cdn.discordapp.com/embed/avatars/0.png'
    
    const redirect = new URL('https://trizly.xyz/unlink/success')
    redirect.searchParams.set('avatar', avatarUrl)
    redirect.searchParams.set('username', user.username || 'Unknown')
    redirect.searchParams.set('userId', user.id)
    
    return c.redirect(redirect.toString(), 302)
  } catch (err: any) {
    console.error('🔥 [lumi-unlink-callback] FATAL ERROR', err)
    return jsonError(c, 500, 'Fatal error during unlink', { error: err.message })
  }
})

app.post('/lumi/unlink/:discordId', async (c) => {
  const discordId = c.req.param('discordId')
  if (!discordId) return jsonError(c, 400, 'Missing discordId')

  const snowflake = /^\d{17,19}$/
  if (!snowflake.test(discordId)) return jsonError(c, 400, 'Invalid Discord ID format')

  const secret = c.req.header('X-Verify-Secret')
  if (!secret || secret !== c.env.VERIFY_WEBHOOK_SECRET) {
    return jsonError(c, 403, 'Invalid authentication')
  }

  const unlinkPayload = { discordId, isSynthetic: false }
  const lumiApiUrl = c.env.LUMI_API_URL || 'http://65.21.16.214:2052'
  const webhookUrl = c.env.UNLINK_WEBHOOK_URL || `${lumiApiUrl}/lumi/unlink/complete`
  
  try {
    const webhookRes = await safeFetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Verify-Secret': c.env.VERIFY_WEBHOOK_SECRET
      },
      body: JSON.stringify(unlinkPayload)
    })
    
    if (!webhookRes.ok) return jsonError(c, 500, 'Failed to process unlink')
    
    const result = await webhookRes.json()
    return c.json({ status: 'ok', message: 'User unlinked successfully', data: result })
  } catch (err: any) {
    console.error('[lumi-unlink-api] error:', err)
    return jsonError(c, 500, 'Internal error', { error: err.message })
  }
})

// Proxy /lumi/lookup/* requests to origin API server
app.get('/lumi/lookup/discord/:discordId', async (c) => {
  try {
    const discordId = c.req.param('discordId')
    if (!discordId || !/^\d{17,19}$/.test(discordId)) {
      return jsonError(c, 400, 'Invalid Discord ID format')
    }

    const apiUrl = c.env.LUMI_API_URL || 'http://localhost:3000'
    const response = await safeFetch(`${apiUrl}/lumi/lookup/discord/${discordId}`)
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('[lumi-lookup-discord] Origin API error:', { status: response.status, error: errorText })
      return jsonError(c, response.status, errorText || 'Lookup failed')
    }

    const data = await response.json()
    return c.json(data)
  } catch (err: any) {
    console.error('[lumi-lookup-discord] fatal', err)
    return jsonError(c, 500, 'Internal error', { error: err?.message })
  }
})

app.get('/lumi/lookup/roblox/:identifier', async (c) => {
  try {
    const identifier = c.req.param('identifier')
    if (!identifier) {
      return jsonError(c, 400, 'Missing identifier')
    }

    const apiUrl = c.env.LUMI_API_URL || 'http://localhost:3000'
    const response = await safeFetch(`${apiUrl}/lumi/lookup/roblox/${encodeURIComponent(identifier)}`)
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('[lumi-lookup-roblox] Origin API error:', { status: response.status, error: errorText })
      return jsonError(c, response.status, errorText || 'Lookup failed')
    }

    const data = await response.json()
    return c.json(data)
  } catch (err: any) {
    console.error('[lumi-lookup-roblox] fatal', err)
    return jsonError(c, 500, 'Internal error', { error: err?.message })
  }
})

app.post('/lumi/portfolio/views/:page', async (c) => {
  try {
    if (!c.env.VIEWS_KV) return jsonError(c, 500, 'VIEWS_KV not configured')

    const page = c.req.param('page')
    if (!page) return jsonError(c, 400, 'Missing page')

    let visitorId: string | null = null
    try {
      const body = await c.req.json<{ visitorId?: string }>()
      visitorId = body?.visitorId || null
    } catch {}

    if (!visitorId || visitorId.length > 120) return jsonError(c, 400, 'Missing or invalid visitorId')

    const seenKey = `views:${page}:seen:${visitorId}`
    const totalKey = `views:${page}:total`
    const ttlSeconds = 60 * 60 * 24 * 365

    const [seen, totalRaw] = await Promise.all([
      c.env.VIEWS_KV.get(seenKey),
      c.env.VIEWS_KV.get(totalKey)
    ])

    let total = parseInt(totalRaw || '0', 10)
    if (Number.isNaN(total) || total < 0) total = 0

    if (!seen) {
      total += 1
      await Promise.all([
        c.env.VIEWS_KV.put(seenKey, '1', { expirationTtl: ttlSeconds }),
        c.env.VIEWS_KV.put(totalKey, total.toString())
      ])
    }

    return c.json({ views: total })
  } catch (err: any) {
    console.error('[lumi-portfolio-views] fatal', err)
    return jsonError(c, 500, 'Internal error', { error: err?.message })
  }
})

// ...existing code...

export default app