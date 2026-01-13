const router = require('express').Router();
const { lookupDiscord, lookupRoblox } = require('../controllers/lookupController');

router.get('/', (req, res) => res.json({ status: 'ok', service: 'lookup' }));

router.get('/discord/:discordId', lookupDiscord);

router.get('/roblox/:identifier', lookupRoblox);

module.exports = router;
