const mongoose = require('mongoose');

const guildConfigSchema = new mongoose.Schema({
    guildId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    verifiedRoleId: {
        type: String,
        required: false,
        default: null
    },
    verificationChannelId: {
        type: String,
        required: false,
        default: null
    },
    welcomeMessage: {
        type: String,
        required: false,
        default: 'Verify Below!'
    },
    unverifiedRoleId: {
        type: String,
        required: false,
        default: null
    },
    useUnverifiedRole: {
        type: Boolean,
        default: false
    },
    verifiedRoleEnabled: {
        type: Boolean,
        default: true
    },
    verificationChannelEnabled: {
        type: Boolean,
        default: false
    },
    autoVerifyOnJoin: {
        type: Boolean,
        default: false
    },
    nameSyncEnabled: {
        type: Boolean,
        default: false
    },
    nameSyncFormat: {
        type: String,
        enum: ['username', 'smart', 'display'],
        default: 'username'
    },
    requireAccountAge: {
        type: Number,
        required: false,
        default: null // Minimum Roblox account age in days
    },
    allowedDomains: {
        type: [String],
        default: []
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

guildConfigSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('GuildConfig', guildConfigSchema);