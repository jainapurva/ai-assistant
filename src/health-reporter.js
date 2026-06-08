// Health reporter — pushes a bot heartbeat to the website's admin API every
// 5 minutes so the admin dashboard (admin.swayat.com) can show liveness,
// queue depth, error rate, and Meta token status. Fire-and-forget: a failed
// push never affects the bot.
const config = require('./config');
const logger = require('./logger');

const PUSH_INTERVAL_MS = parseInt(process.env.HEALTH_PUSH_INTERVAL_MS || '300000', 10);
const HEALTH_API_URL = `${config.analyticsBaseUrl}/api/admin/health`;

const startedAt = new Date();
let getters = {
  getQueuedMessages: () => 0,
  getActiveTasks: () => 0,
};

// Last Meta Graph API auth failure (token expired/invalid), null if none
let lastMetaAuthErrorAt = null;
// Cleared whenever a Graph API call succeeds
let lastMetaOkAt = null;

// Called by cloud-api-provider when Graph API returns an OAuth error (code 190)
function recordMetaAuthError() {
  lastMetaAuthErrorAt = new Date();
}

// Called by cloud-api-provider on any successful Graph API call
function recordMetaOk() {
  lastMetaOkAt = new Date();
}

function metaTokenOk() {
  if (!lastMetaAuthErrorAt) return true;
  // An auth error is considered resolved once a later call succeeds
  return !!(lastMetaOkAt && lastMetaOkAt >= lastMetaAuthErrorAt);
}

/**
 * Wire up live getters from index.js (queue depth, active tasks).
 */
function init(opts = {}) {
  getters = { ...getters, ...opts };
}

function buildSnapshot() {
  return {
    reportedAt: new Date().toISOString(),
    startedAt: startedAt.toISOString(),
    uptimeSecs: Math.round((Date.now() - startedAt.getTime()) / 1000),
    queuedMessages: safeGet('getQueuedMessages'),
    activeTasks: safeGet('getActiveTasks'),
    errorsLastHour: logger.getErrorsLastHour(),
    metaTokenOk: metaTokenOk(),
    lastMetaAuthErrorAt: lastMetaAuthErrorAt ? lastMetaAuthErrorAt.toISOString() : null,
    nodeVersion: process.version,
    memoryRssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
  };
}

function safeGet(name) {
  try {
    return getters[name]();
  } catch {
    return null;
  }
}

async function push() {
  if (!config.serviceApiSecret) return;
  try {
    await fetch(HEALTH_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.serviceApiSecret,
      },
      body: JSON.stringify(buildSnapshot()),
    });
  } catch (e) {
    // Never let health reporting break anything; log once in a while is enough
    logger.warn('Health push failed:', e.message);
  }
}

let timer = null;
function start() {
  if (timer) return;
  push(); // immediate push on startup so the dashboard sees restarts quickly
  timer = setInterval(push, PUSH_INTERVAL_MS);
  timer.unref();
  logger.info(`Health reporter started (every ${Math.round(PUSH_INTERVAL_MS / 1000)}s → ${HEALTH_API_URL})`);
}

module.exports = {
  init,
  start,
  push,
  recordMetaAuthError,
  recordMetaOk,
  buildSnapshot,
};
