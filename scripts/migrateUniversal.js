

require('dotenv').config();
const mongoose = require('mongoose');
const legacyUser = require('../src/models/user');
const VerifiedUser = require('../src/models/verifiedUser');

async function run() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI missing');
  await mongoose.connect(uri);

  const all = await legacyUser.find();
  const byDiscord = new Map();
  for (const doc of all) {
    const prev = byDiscord.get(doc.discordId);
    if (!prev || doc.updatedAt > prev.updatedAt) {
      byDiscord.set(doc.discordId, doc);
    }
  }

  let count = 0;
  for (const [discordId, doc] of byDiscord.entries()) {
    await VerifiedUser.findOneAndUpdate(
      { discordId },
      { discordId, robloxId: doc.robloxId, username: doc.username, verifiedAt: doc.verifiedAt || new Date() },
      { upsert: true }
    );
    count++;
  }

  try {
    await legacyUser.collection.dropIndex('discordId_1_guildId_1');
    console.log('Dropped legacy compound index');
  } catch (e) {
    console.log('Legacy index not found (ok)');
  }

  await VerifiedUser.collection.createIndex({ discordId: 1 }, { unique: true });
  console.log(`Migrated ${count} users to universal model.`);
  await mongoose.disconnect();
}

run().catch(err => { console.error('Migration error', err); process.exit(1); });