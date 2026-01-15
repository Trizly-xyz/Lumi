const express = require("express");
const path = require("path");

function startSite() {
	const app = express();
	const root = path.resolve(__dirname);

	// Serving API only; the public site is hosted separately on trizly.xyz

	// API
	const eventBus = require("./src/utils/eventBus");
	const startApi = require('./src/api/api');
	const apiApp = startApi(eventBus);
	app.use(apiApp);


	// Health check endpoint
	app.get("/", (req, res) => {
		res.json({ status: "online", service: "Trizly Backend API", timestamp: new Date().toISOString() });
	});

	// Prefer explicit PORT, then WEB_PORT fallback, then default 443
	const PORT = process.env.PORT;
	app.listen(PORT, '0.0.0.0', () => {
		// Server running
	});
}

module.exports = startSite;