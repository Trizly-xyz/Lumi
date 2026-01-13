const mongoose = require('mongoose');
const logger = require('./logger');
require('dotenv').config();

const uri = process.env.MONGO_URI;
if (!uri) {
  logger.error('Environment variable MONGO_URI is missing.');
  process.exit(1);
}

mongoose.connect(uri).then(() => {
  logger.info('MongoDB connection established');
}).catch(err => {
  logger.error('MongoDB connection error', { error: err.message });
  process.exit(1);
});
