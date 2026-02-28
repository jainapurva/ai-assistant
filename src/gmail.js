/**
 * Gmail integration — per-user OAuth2 authentication and Gmail API operations.
 *
 * Users authenticate via /gmail login (generates OAuth consent URL).
 * Tokens are stored per-user in gmail-tokens.json.
 * Supports: send email, list/search inbox, read individual emails.
 */

const { google } = require('googleapis');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./logger');

const TOKENS_FILE = path.join(config.stateDir, 'gmail-tokens.json');
const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];

// ── Token persistence (read-every-time pattern, like profiles.js) ────────────

function loadTokens() {
  try {
    if (fs.existsSync(TOKENS_FILE)) {
      return JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
    }
  } catch (e) {
    logger.warn('Failed to load Gmail tokens:', e.message);
  }
  return {};
}

function saveTokens(tokens) {
  try {
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
  } catch (e) {
    logger.warn('Failed to save Gmail tokens:', e.message);
  }
}

function getUserTokens(waId) {
  return loadTokens()[waId] || null;
}

function setUserTokens(waId, tokenData) {
  const tokens = loadTokens();
  tokens[waId] = tokenData;
  saveTokens(tokens);
}

function removeUserTokens(waId) {
  const tokens = loadTokens();
  delete tokens[waId];
  saveTokens(tokens);
}

// ── OAuth2 client creation ───────────────────────────────────────────────────

function isConfigured() {
  return !!(config.googleClientId && config.googleClientSecret && config.googleRedirectUri);
}

function createOAuth2Client() {
  return new google.auth.OAuth2(
    config.googleClientId,
    config.googleClientSecret,
    config.googleRedirectUri
  );
}

/**
 * Create an authenticated OAuth2 client for a user.
 * Listens for token refresh events and auto-persists new tokens.
 */
function createAuthenticatedClient(waId) {
  const tokenData = getUserTokens(waId);
  if (!tokenData) return null;

  const client = createOAuth2Client();
  client.setCredentials({
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expiry_date: tokenData.expiry_date,
  });

  // Auto-persist refreshed tokens
  client.on('tokens', (newTokens) => {
    const current = getUserTokens(waId);
    if (current) {
      if (newTokens.access_token) current.access_token = newTokens.access_token;
      if (newTokens.expiry_date) current.expiry_date = newTokens.expiry_date;
      if (newTokens.refresh_token) current.refresh_token = newTokens.refresh_token;
      setUserTokens(waId, current);
      logger.info(`Gmail tokens refreshed for ${waId}`);
    }
  });

  return client;
}

// ── OAuth state encryption (maps callback back to waId) ──────────────────────

function getEncryptionKey() {
  return crypto.createHash('sha256').update(config.metaAppSecret || 'gmail-oauth-fallback').digest();
}

function encryptState(waId) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const payload = JSON.stringify({ waId, ts: Date.now() });
  let encrypted = cipher.update(payload, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decryptState(stateStr) {
  try {
    const key = getEncryptionKey();
    const [ivHex, encrypted] = stateStr.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    const payload = JSON.parse(decrypted);

    // Reject state older than 10 minutes
    if (Date.now() - payload.ts > 10 * 60 * 1000) {
      logger.warn('Gmail OAuth state expired');
      return null;
    }
    return payload;
  } catch (e) {
    logger.warn('Failed to decrypt Gmail OAuth state:', e.message);
    return null;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate OAuth2 consent URL for a user.
 */
function getAuthUrl(waId) {
  const client = createOAuth2Client();
  const state = encryptState(waId);
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: GMAIL_SCOPES,
    state,
  });
}

/**
 * Handle OAuth2 callback — exchange code for tokens, store them.
 * Returns { waId, email }.
 */
async function handleCallback(code, state) {
  const payload = decryptState(state);
  if (!payload) {
    throw new Error('Invalid or expired OAuth state. Please try /gmail login again.');
  }

  const client = createOAuth2Client();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  // Get the user's email address
  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  const userInfo = await oauth2.userinfo.get();
  const email = userInfo.data.email;

  setUserTokens(payload.waId, {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date,
    email,
    scope: tokens.scope,
    connectedAt: new Date().toISOString(),
  });

  logger.info(`Gmail connected for ${payload.waId}: ${email}`);
  return { waId: payload.waId, email };
}

/**
 * Send an email on behalf of a user.
 */
async function sendEmail(waId, to, subject, body) {
  const client = createAuthenticatedClient(waId);
  if (!client) throw new Error('Gmail not connected. Use /gmail login first.');

  const tokenData = getUserTokens(waId);
  const from = tokenData.email;

  // Build RFC 2822 email
  const messageParts = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ];
  const rawMessage = messageParts.join('\r\n');
  const encodedMessage = Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const gmail = google.gmail({ version: 'v1', auth: client });
  const result = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encodedMessage },
  });

  logger.info(`Gmail: email sent by ${waId} to ${to} (id: ${result.data.id})`);
  return { messageId: result.data.id, from, to, subject };
}

/**
 * List/search emails in the user's inbox.
 * @param {string} waId - User's WhatsApp ID
 * @param {string} [query] - Gmail search query (e.g. "from:user@example.com")
 * @param {number} [maxResults=10] - Max emails to return
 */
async function listEmails(waId, query, maxResults = 10) {
  const client = createAuthenticatedClient(waId);
  if (!client) throw new Error('Gmail not connected. Use /gmail login first.');

  const gmail = google.gmail({ version: 'v1', auth: client });

  const listParams = { userId: 'me', maxResults };
  if (query) listParams.q = query;

  const listResult = await gmail.users.messages.list(listParams);
  const messages = listResult.data.messages || [];

  if (messages.length === 0) return [];

  // Fetch headers for each message
  const emails = await Promise.all(
    messages.map(async (m) => {
      const msg = await gmail.users.messages.get({
        userId: 'me',
        id: m.id,
        format: 'metadata',
        metadataHeaders: ['From', 'To', 'Subject', 'Date'],
      });

      const headers = msg.data.payload.headers || [];
      const getHeader = (name) => {
        const h = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
        return h ? h.value : '';
      };

      return {
        id: m.id,
        from: getHeader('From'),
        to: getHeader('To'),
        subject: getHeader('Subject'),
        date: getHeader('Date'),
        snippet: msg.data.snippet || '',
      };
    })
  );

  return emails;
}

/**
 * Read a specific email by ID. Returns full message details with body text.
 */
async function getEmail(waId, messageId) {
  const client = createAuthenticatedClient(waId);
  if (!client) throw new Error('Gmail not connected. Use /gmail login first.');

  const gmail = google.gmail({ version: 'v1', auth: client });
  const msg = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  });

  const headers = msg.data.payload.headers || [];
  const getHeader = (name) => {
    const h = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
    return h ? h.value : '';
  };

  // Extract plain text body from the message parts
  let bodyText = '';
  function extractText(part) {
    if (part.mimeType === 'text/plain' && part.body && part.body.data) {
      bodyText += Buffer.from(part.body.data, 'base64').toString('utf8');
    }
    if (part.parts) {
      part.parts.forEach(extractText);
    }
  }
  extractText(msg.data.payload);

  // Fallback to snippet if no plain text body found
  if (!bodyText) bodyText = msg.data.snippet || '';

  return {
    id: messageId,
    from: getHeader('From'),
    to: getHeader('To'),
    subject: getHeader('Subject'),
    date: getHeader('Date'),
    body: bodyText,
  };
}

/**
 * Get Gmail connection status for a user.
 */
function getStatus(waId) {
  const tokenData = getUserTokens(waId);
  if (!tokenData) return { connected: false };
  return {
    connected: true,
    email: tokenData.email,
    connectedAt: tokenData.connectedAt,
  };
}

module.exports = {
  isConfigured,
  getAuthUrl,
  handleCallback,
  sendEmail,
  listEmails,
  getEmail,
  getStatus,
  removeUserTokens,
  getUserTokens,
};
