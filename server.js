const express = require("express");
const path = require("path");

function startSite() {
  const app = express();
  const root = path.resolve(__dirname);

  // Health check endpoint BEFORE API routes
  app.get("/health", (req, res) => {
    res.json({ status: "online", service: "Lumi Bot API", timestamp: new Date().toISOString() });
  });

  app.get("/", (req, res) => {
    res.json({ status: "online", service: "Lumi Bot API", timestamp: new Date().toISOString() });
  });

  // API routes AFTER health checks
  const eventBus = require("./src/utils/eventBus");
  const startApi = require('./src/api/api');
  const apiApp = startApi(eventBus);
  app.use('/lumi', apiApp);

  const PORT = process.env.PORT || 22028;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🤖 Lumi Bot API running on port ${PORT}`);
  });
}

module.exports = startSite;