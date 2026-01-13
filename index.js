require('dotenv').config();

const logger = require('./src/utils/logger');
const { validateEnv } = require('./src/utils/config');
const startSite = require('./server');
const startBot = require('./src/bot/bot');
const eventBus = require('./src/utils/eventBus');
require('./src/utils/database');
const { cleanupPending } = require('./src/utils/cleanup');

const startupLogger = logger.child({ scope: 'startup' });
const eventLogger = logger.child({ scope: 'event-bus' });

function configureLogging() {
	const level = process.env.LOG_LEVEL || 'info';
	logger.setLevel(level);
}

function registerProcessGuards() {
	process.on('unhandledRejection', (reason) => {
		startupLogger.error('Unhandled promise rejection', {
			reason: (reason && reason.message) || reason,
			stack: reason && reason.stack
		});
	});
	process.on('uncaughtException', (err) => {
		startupLogger.error('Uncaught exception', { error: err.message, stack: err.stack });
	});
	require('events').defaultMaxListeners = 50;
}

function startCleanupLoop(intervalMs) {
	setInterval(() => cleanupPending(intervalMs, logger), intervalMs);
}

function main() {
	startupLogger.warn('Starting Lumi services');
	configureLogging();
	validateEnv(startupLogger);
	registerProcessGuards();

	startupLogger.warn('Starting API');
	startSite();

	startupLogger.warn('Starting Lumi bot');
	startBot(eventBus, logger);

	eventBus.on('error', (e) => eventLogger.error('Event bus error', { error: e.message, stack: e.stack }));

	const minutes = parseInt(process.env.VERIFICATION_CLEAN_MINUTES || '10', 10);
	const intervalMs = minutes * 60 * 1000;
	startCleanupLoop(intervalMs);

	startupLogger.warn('Startup complete');
}

main();
