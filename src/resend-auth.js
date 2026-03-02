/**
 * Per-user Resend API key storage.
 *
 * Users authenticate via /resend setup <api-key>.
 * Keys are stored per-user in resend-keys.json.
 */

const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./logger');

const KEYS_FILE = path.join(config.stateDir, 'resend-keys.json');

// ── Key persistence (read-every-time pattern, like google-auth.js) ────────

function loadKeys() {
  try {
    if (fs.existsSync(KEYS_FILE)) {
      return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
    }
  } catch (e) {
    logger.warn('Failed to load Resend keys:', e.message);
  }
  return {};
}

function saveKeys(keys) {
  try {
    fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2));
  } catch (e) {
    logger.warn('Failed to save Resend keys:', e.message);
  }
}

function getUserKey(waId) {
  return loadKeys()[waId] || null;
}

function setUserKey(waId, data) {
  const keys = loadKeys();
  keys[waId] = data;
  saveKeys(keys);
}

function removeUserKey(waId) {
  const keys = loadKeys();
  delete keys[waId];
  saveKeys(keys);
}

function isUserConnected(waId) {
  return !!getUserKey(waId);
}

/**
 * Get Resend connection status for a user.
 * Returns { connected, connectedAt } or { connected: false }.
 */
function getStatus(waId) {
  const data = getUserKey(waId);
  if (!data) return { connected: false };
  return { connected: true, connectedAt: data.connectedAt };
}

/**
 * Resolve the Resend API key for a given user.
 * Returns the API key string or null.
 */
function resolveApiKey(waId) {
  const data = getUserKey(waId);
  return (data && data.apiKey) || null;
}

/**
 * Validate a Resend API key by calling the list-domains endpoint.
 * Returns { valid: true, domains: [...] } or { valid: false, error: '...' }.
 */
async function validateKey(apiKey) {
  try {
    const response = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) {
      const body = await response.text();
      return { valid: false, error: `API returned ${response.status}: ${body.slice(0, 200)}` };
    }
    const data = await response.json();
    return { valid: true, domains: data.data || [] };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

module.exports = {
  getUserKey,
  setUserKey,
  removeUserKey,
  isUserConnected,
  getStatus,
  resolveApiKey,
  validateKey,
  KEYS_FILE,
};
