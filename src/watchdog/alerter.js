'use strict';

const https = require('https');
const config = require('./config');

// ── State ──
const alertHistory = new Map(); // issueType → { lastSentAt, count, firstSeen }
const hourlyCounts = new Map(); // issueType → [{ ts }]

function loadEnv() {
  // Read .env for Meta credentials — no dotenv dependency, parse manually
  const fs = require('fs');
  const envPath = require('path').join(config.botDir, '.env');
  const vars = {};
  try {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([^#=]+?)\s*=\s*(.*?)\s*$/);
      if (match) vars[match[1]] = match[2];
    }
  } catch { /* ignore */ }
  return vars;
}

let _env = null;
function env() {
  if (!_env) _env = loadEnv();
  return _env;
}

/**
 * Send a WhatsApp message via Meta Graph API.
 * Works even when the bot is completely dead.
 */
function sendWhatsApp(recipientPhone, text) {
  return new Promise((resolve, reject) => {
    const e = env();
    const token = e.META_ACCESS_TOKEN;
    const phoneId = e.META_PHONE_NUMBER_ID;
    if (!token || !phoneId) {
      reject(new Error('Missing META_ACCESS_TOKEN or META_PHONE_NUMBER_ID'));
      return;
    }

    const body = JSON.stringify({
      messaging_product: 'whatsapp',
      to: recipientPhone,
      type: 'text',
      text: { body: text.slice(0, 4096) },
    });

    const req = https.request({
      hostname: 'graph.facebook.com',
      path: `/${config.metaApiVersion}/${phoneId}/messages`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`Meta API ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(15_000, () => { req.destroy(); reject(new Error('Meta API timeout')); });
    req.write(body);
    req.end();
  });
}

/**
 * Check if an alert should be suppressed based on deduplication rules.
 */
function shouldSuppress(issueType) {
  const now = Date.now();
  const history = alertHistory.get(issueType);

  if (!history) return false; // First occurrence — send immediately

  const elapsed = now - history.lastSentAt;
  const sinceFirst = now - history.firstSeen;

  // Prune hourly counts
  const counts = hourlyCounts.get(issueType) || [];
  const recent = counts.filter(c => now - c.ts < 3_600_000);
  hourlyCounts.set(issueType, recent);

  // Max alerts per hour
  if (recent.length >= config.alerts.maxPerHour) return true;

  // Escalation phase (after 30 min): alert every 15 min
  if (sinceFirst >= config.alerts.escalateMs) {
    return elapsed < config.alerts.escalateIntervalMs;
  }

  // Suppression phase: suppress for 5 min after first alert
  return elapsed < config.alerts.suppressMs;
}

function recordAlert(issueType) {
  const now = Date.now();
  const history = alertHistory.get(issueType);

  if (!history) {
    alertHistory.set(issueType, { lastSentAt: now, count: 1, firstSeen: now });
  } else {
    history.lastSentAt = now;
    history.count++;
  }

  const counts = hourlyCounts.get(issueType) || [];
  counts.push({ ts: now });
  hourlyCounts.set(issueType, counts);
}

/**
 * Send an alert to all recipients (with deduplication).
 * @param {string} issueType - e.g. 'process_dead', 'port_down', 'claude_auth'
 * @param {string} message - Alert body
 * @param {object} [opts]
 * @param {boolean} [opts.force] - Skip deduplication
 * @param {boolean} [opts.resolution] - This is a resolution message (always send, clear history)
 */
async function alert(issueType, message, opts = {}) {
  if (opts.resolution) {
    alertHistory.delete(issueType);
    // Resolution messages always send
  } else if (!opts.force && shouldSuppress(issueType)) {
    return;
  }

  if (!opts.resolution) {
    recordAlert(issueType);
  }

  const prefix = opts.resolution ? '[OK]' : '[ALERT]';
  const fullMessage = `${prefix} AI Assistant Watchdog\n\n${message}`;

  const results = [];
  for (const phone of config.recipients) {
    try {
      await sendWhatsApp(phone, fullMessage);
      results.push({ phone, success: true });
    } catch (err) {
      results.push({ phone, success: false, error: err.message });
    }
  }
  return results;
}

/**
 * Send a resolution (OK) alert.
 */
async function alertResolved(issueType, message) {
  return alert(issueType, message, { resolution: true });
}

// Exported for testing
module.exports = { alert, alertResolved, sendWhatsApp, shouldSuppress, loadEnv, _resetState };

function _resetState() {
  alertHistory.clear();
  hourlyCounts.clear();
  _env = null;
}
