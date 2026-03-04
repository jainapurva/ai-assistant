'use strict';

const path = require('path');

// All paths under storage policy
const STORAGE_DIR = '/media/ddarji/storage/ai-assistant';

module.exports = {
  // ── Paths ──
  botDir: path.resolve(__dirname, '../..'),
  botEntry: path.resolve(__dirname, '../index.js'),
  pidFile: path.join(STORAGE_DIR, 'bot.pid'),
  botLogFile: path.join(STORAGE_DIR, 'bot.log'),
  watchdogLogFile: path.join(STORAGE_DIR, 'watchdog.log'),
  stateFile: path.join(STORAGE_DIR, 'bot_state.json'),
  resetFile: path.join(STORAGE_DIR, 'watchdog_reset'),
  credentialsFile: '/home/ddarji/.claude/.credentials.json',
  claudeBinary: '/home/ddarji/.local/bin/claude',
  nodeBinary: '/home/ddarji/.nvm/versions/node/v20.20.0/bin/node',

  // ── Ports ──
  webhookPort: 3000,
  apiPort: parseInt(process.env.HTTP_PORT || '5153', 10),

  // ── Health check intervals ──
  checkIntervalMs: 30_000,

  // ── Failure thresholds (consecutive failures before action) ──
  thresholds: {
    processAlive: 2,
    webhookPort: 2,
    apiHealth: 2,
    claudeAuth: 1,
    stuckTasks: 3,
  },

  // ── Timeouts ──
  tcpTimeoutMs: 5_000,
  httpTimeoutMs: 10_000,
  shutdownWaitMs: 5_000,
  postStartWaitMs: 5_000,

  // ── Stuck task age ──
  stuckTaskAgeMs: 30 * 60_000,

  // ── Circuit breaker ──
  circuitBreaker: {
    maxRestarts: 3,
    windowMs: 10 * 60_000,
    cooldownMs: 30 * 60_000,
  },

  // ── Alert deduplication ──
  alerts: {
    suppressMs: 5 * 60_000,
    escalateMs: 30 * 60_000,
    escalateIntervalMs: 15 * 60_000,
    maxPerHour: 10,
  },

  // ── Alert recipients (WhatsApp IDs) ──
  recipients: ['16262300167', '14243937267'],

  // ── Meta Graph API ──
  metaApiVersion: 'v21.0',

  // ── OpenAI diagnostics ──
  openaiModel: 'gpt-4o',
  openaiMaxTokens: 500,
  diagnosticLogLines: 50,
};
