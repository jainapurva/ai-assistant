/**
 * FreeTools.us auth module — per-user account management.
 *
 * Each Swayat user gets an auto-provisioned freetools account keyed by their
 * chatId. Credentials (JWT + refresh) are stored in freetools-accounts.json.
 *
 * Users never touch freetools.us directly — this module handles registration,
 * login, token refresh, and all API calls on their behalf.
 */

const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./logger');

const ACCOUNTS_FILE = path.join(config.stateDir, 'freetools-accounts.json');
const FREETOOLS_API = process.env.FREETOOLS_API_URL || 'https://freetools.us/uploader/auth';
const FREETOOLS_BASE = process.env.FREETOOLS_API_URL
  ? process.env.FREETOOLS_API_URL.replace('/auth', '')
  : 'https://freetools.us/uploader';

// ── Storage helpers ──────────────────────────────────────────────────────────

function loadAccounts() {
  try {
    if (fs.existsSync(ACCOUNTS_FILE)) {
      return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
    }
  } catch (e) {
    logger.warn(`freetools-auth: failed to load accounts: ${e.message}`);
  }
  return {};
}

function saveAccounts(accounts) {
  try {
    const tmp = ACCOUNTS_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(accounts, null, 2));
    fs.renameSync(tmp, ACCOUNTS_FILE);
  } catch (e) {
    logger.error(`freetools-auth: failed to save accounts: ${e.message}`);
  }
}

function getAccount(chatId) {
  return loadAccounts()[chatId] || null;
}

function setAccount(chatId, data) {
  const accounts = loadAccounts();
  accounts[chatId] = { ...accounts[chatId], ...data, updatedAt: new Date().toISOString() };
  saveAccounts(accounts);
}

function removeAccount(chatId) {
  const accounts = loadAccounts();
  delete accounts[chatId];
  saveAccounts(accounts);
}

// ── Deterministic credentials per Swayat user ────────────────────────────────

function emailForChat(chatId) {
  // Sanitise chatId (may contain @ or - from WhatsApp IDs)
  const safe = chatId.replace(/[^a-zA-Z0-9]/g, '_');
  return `wa_${safe}@swayat.internal`;
}

function passwordForChat(chatId) {
  // Stable password derived from chatId + a server-side secret so it's
  // reproducible across bot restarts without storing plaintext passwords.
  const secret = process.env.FREETOOLS_PASSWORD_SALT || 'swayat-freetools-salt-2026';
  const crypto = require('crypto');
  return crypto.createHmac('sha256', secret).update(chatId).digest('hex').slice(0, 32);
}

// ── HTTP helper ──────────────────────────────────────────────────────────────

async function ftFetch(path, opts = {}, token = null) {
  const url = `${FREETOOLS_BASE}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) {
    const detail = data?.detail;
    const msg = (detail && typeof detail !== 'string' ? JSON.stringify(detail) : detail)
      || data?.error
      || `HTTP ${res.status}: ${text.slice(0, 200)}`;
    throw new Error(msg);
  }
  return data;
}

// ── Core auth operations ─────────────────────────────────────────────────────

/**
 * Ensure a freetools account exists for this chatId.
 * Registers a new account if needed, then logs in and stores the JWT.
 * Returns { token, email }.
 */
async function ensureAccount(chatId) {
  const email = emailForChat(chatId);
  const password = passwordForChat(chatId);

  const existing = getAccount(chatId);

  // If we have a valid JWT, use it
  if (existing?.token) {
    // Tokens are valid for 7 days — refresh if within 1 day of expiry
    const expiresAt = existing.tokenExpiresAt ? new Date(existing.tokenExpiresAt) : null;
    if (!expiresAt || expiresAt > new Date(Date.now() + 86400_000)) {
      return { token: existing.token, email };
    }
  }

  // Try login first
  try {
    const data = await ftFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    const token = data.access_token;
    setAccount(chatId, {
      email,
      token,
      tokenExpiresAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
    });
    return { token, email };
  } catch (loginErr) {
    // Login failed — try registering
    if (!loginErr.message.includes('401') && !loginErr.message.toLowerCase().includes('incorrect')) {
      throw loginErr;
    }
  }

  // Register new account
  try {
    await ftFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  } catch (regErr) {
    // May already exist — ignore duplicate errors
    if (!regErr.message.toLowerCase().includes('already') &&
        !regErr.message.toLowerCase().includes('exist') &&
        !regErr.message.includes('400')) {
      throw regErr;
    }
  }

  // Login after registration
  const data = await ftFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  const token = data.access_token;
  setAccount(chatId, {
    email,
    token,
    tokenExpiresAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
    registeredAt: new Date().toISOString(),
  });
  return { token, email };
}

/**
 * Make an authenticated API call to freetools on behalf of chatId.
 */
async function apiCall(chatId, method, apiPath, body = null) {
  const { token } = await ensureAccount(chatId);
  return ftFetch(apiPath, {
    method,
    ...(body ? { body: JSON.stringify(body) } : {}),
  }, token);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns true if the user has a freetools account provisioned.
 */
function isConnected(chatId) {
  const acc = getAccount(chatId);
  return !!(acc?.token);
}

/**
 * Get connection status for a user.
 */
function getStatus(chatId) {
  const acc = getAccount(chatId);
  if (!acc?.token) return { connected: false };
  return {
    connected: true,
    email: acc.email,
    registeredAt: acc.registeredAt,
    socialAccounts: acc.socialAccounts || [],
  };
}

/**
 * Disconnect / remove stored account for a user.
 */
function disconnect(chatId) {
  removeAccount(chatId);
}

/**
 * Get the OAuth connect URL for a given platform (TWITTER, LINKEDIN, INSTAGRAM).
 * The JWT is embedded so the user just taps the link.
 */
async function getConnectUrl(chatId, platform) {
  const { token } = await ensureAccount(chatId);
  const platformMap = {
    TWITTER: '/uploader/auth/twitter/oauth1/login',
    LINKEDIN: '/uploader/auth/linkedin/login',
    INSTAGRAM: '/uploader/auth/instagram/graph/login',
  };
  const pathSuffix = platformMap[platform.toUpperCase()];
  if (!pathSuffix) throw new Error(`Unsupported platform: ${platform}. Supported: TWITTER, LINKEDIN, INSTAGRAM`);
  return `https://freetools.us${pathSuffix}?token=${encodeURIComponent(token)}`;
}

/**
 * List connected social accounts (optionally filter by platform).
 */
async function listAccounts(chatId, platform = null) {
  const apiPath = platform
    ? `/api/accounts?platform=${platform.toUpperCase()}`
    : '/api/accounts';
  return apiCall(chatId, 'GET', apiPath);
}

/**
 * Disconnect a social account by ID.
 */
async function disconnectSocialAccount(chatId, accountId) {
  return apiCall(chatId, 'DELETE', `/api/accounts/${accountId}`);
}

/**
 * Publish a post immediately.
 * @param {string} chatId
 * @param {number[]} accountIds - social account IDs to post to
 * @param {string} caption - post text
 * @param {string|null} mediaUrl - optional media URL
 * @param {string|null} mediaType - 'IMAGE' | 'VIDEO' | null
 */
async function publishNow(chatId, accountIds, caption, mediaUrl = null, mediaType = null) {
  const body = { social_account_id: accountIds[0], caption };
  if (mediaUrl) body.media_url = mediaUrl;
  if (mediaType) body.media_type = mediaType;
  return apiCall(chatId, 'POST', '/api/posts/publish-now', body);
}

/**
 * Schedule a post for a future time.
 * @param {string} scheduledTime - ISO 8601 datetime string
 */
async function schedulePost(chatId, accountIds, caption, scheduledTime, mediaUrl = null, mediaType = null) {
  const body = { social_account_id: accountIds[0], caption, scheduled_time: scheduledTime };
  if (mediaUrl) body.media_url = mediaUrl;
  if (mediaType) body.media_type = mediaType;
  return apiCall(chatId, 'POST', '/api/posts/schedule', body);
}

/**
 * List scheduled/published posts.
 */
async function listPosts(chatId) {
  return apiCall(chatId, 'GET', '/api/posts');
}

/**
 * Delete a scheduled post by ID.
 */
async function deletePost(chatId, postId) {
  return apiCall(chatId, 'DELETE', `/api/posts/${postId}`);
}

module.exports = {
  isConnected,
  getStatus,
  disconnect,
  ensureAccount,
  getConnectUrl,
  listAccounts,
  disconnectSocialAccount,
  publishNow,
  schedulePost,
  listPosts,
  deletePost,
};
