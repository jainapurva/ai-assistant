const config = require('../config');
const logger = require('../logger');
const CloudAPIProvider = require('./cloud-api-provider');

/**
 * Factory: create the Cloud API provider.
 */
function createProvider() {
  logger.info('Creating WhatsApp provider: cloud-api');
  return new CloudAPIProvider(config);
}

module.exports = { createProvider };
