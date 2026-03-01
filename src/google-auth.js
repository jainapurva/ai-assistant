/**
 * Unified Google OAuth2 — Gmail, Drive, Docs, Sheets.
 *
 * Users authenticate via /gmail login (generates OAuth consent URL).
 * Tokens are stored per-user in google-tokens.json.
 * Supports: Gmail (send, inbox, read), Drive (list, upload, get), Sheets (read, write, create), Docs (read, create).
 */

const { google } = require('googleapis');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./logger');

const TOKENS_FILE = path.join(config.stateDir, 'google-tokens.json');
const LEGACY_TOKENS_FILE = path.join(config.stateDir, 'gmail-tokens.json');

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/documents',
];

// ── Auto-migrate legacy gmail-tokens.json → google-tokens.json ──────────────

function migrateTokens() {
  try {
    if (fs.existsSync(LEGACY_TOKENS_FILE) && !fs.existsSync(TOKENS_FILE)) {
      fs.copyFileSync(LEGACY_TOKENS_FILE, TOKENS_FILE);
      logger.info('Migrated gmail-tokens.json → google-tokens.json');
    }
  } catch (e) {
    logger.warn('Token migration failed:', e.message);
  }
}
migrateTokens();

// ── Token persistence (read-every-time pattern, like profiles.js) ────────────

function loadTokens() {
  try {
    if (fs.existsSync(TOKENS_FILE)) {
      return JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
    }
  } catch (e) {
    logger.warn('Failed to load Google tokens:', e.message);
  }
  return {};
}

function saveTokens(tokens) {
  try {
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
  } catch (e) {
    logger.warn('Failed to save Google tokens:', e.message);
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
      logger.info(`Google tokens refreshed for ${waId}`);
    }
  });

  return client;
}

// ── OAuth state encryption (maps callback back to waId) ──────────────────────

function getEncryptionKey() {
  return crypto.createHash('sha256').update(config.metaAppSecret || 'google-oauth-fallback').digest();
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
      logger.warn('Google OAuth state expired');
      return null;
    }
    return payload;
  } catch (e) {
    logger.warn('Failed to decrypt Google OAuth state:', e.message);
    return null;
  }
}

// ── Public API: OAuth ────────────────────────────────────────────────────────

/**
 * Generate OAuth2 consent URL for a user.
 */
function getAuthUrl(waId) {
  const client = createOAuth2Client();
  const state = encryptState(waId);
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: GOOGLE_SCOPES,
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

  logger.info(`Google connected for ${payload.waId}: ${email}`);
  return { waId: payload.waId, email };
}

// ── Public API: Gmail ────────────────────────────────────────────────────────

/**
 * Send an email on behalf of a user.
 */
async function sendEmail(waId, to, subject, body) {
  const client = createAuthenticatedClient(waId);
  if (!client) throw new Error('Google not connected. Use /gmail login first.');

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
 */
async function listEmails(waId, query, maxResults = 10) {
  const client = createAuthenticatedClient(waId);
  if (!client) throw new Error('Google not connected. Use /gmail login first.');

  const gmail = google.gmail({ version: 'v1', auth: client });

  const listParams = { userId: 'me', maxResults };
  if (query) listParams.q = query;

  const listResult = await gmail.users.messages.list(listParams);
  const messages = listResult.data.messages || [];

  if (messages.length === 0) return [];

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
  if (!client) throw new Error('Google not connected. Use /gmail login first.');

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

// ── Public API: Drive ────────────────────────────────────────────────────────

/**
 * List files in the user's Drive (recent, or by query).
 */
async function listDriveFiles(waId, query, maxResults = 20) {
  const client = createAuthenticatedClient(waId);
  if (!client) throw new Error('Google not connected. Use /gmail login first.');

  const driveApi = google.drive({ version: 'v3', auth: client });

  const params = {
    pageSize: maxResults,
    fields: 'files(id, name, mimeType, size, modifiedTime, webViewLink)',
    orderBy: 'modifiedTime desc',
  };
  if (query) {
    params.q = `${query} and trashed=false`;
  } else {
    params.q = 'trashed=false';
  }

  const res = await driveApi.files.list(params);
  return (res.data.files || []).map(f => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    size: f.size ? parseInt(f.size, 10) : 0,
    modifiedTime: f.modifiedTime,
    link: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
  }));
}

/**
 * Upload a file to the user's Drive.
 * @param {string} waId - User's WhatsApp ID
 * @param {string} filePath - Local path to file
 * @param {string} [folderId] - Optional parent folder ID
 * @returns {{ id, name, link }}
 */
async function uploadToDrive(waId, filePath, folderId) {
  const client = createAuthenticatedClient(waId);
  if (!client) throw new Error('Google not connected. Use /gmail login first.');

  const driveApi = google.drive({ version: 'v3', auth: client });
  const fileName = path.basename(filePath);

  const requestBody = { name: fileName };
  if (folderId) requestBody.parents = [folderId];

  const res = await driveApi.files.create({
    requestBody,
    media: { body: fs.createReadStream(filePath) },
    fields: 'id, name, webViewLink',
  });

  // Make the file viewable by anyone with the link
  await driveApi.permissions.create({
    fileId: res.data.id,
    requestBody: { role: 'reader', type: 'anyone' },
  });

  logger.info(`Drive: uploaded "${fileName}" for ${waId} → ${res.data.id}`);
  return {
    id: res.data.id,
    name: res.data.name,
    link: res.data.webViewLink || `https://drive.google.com/file/d/${res.data.id}/view`,
  };
}

/**
 * Get a Drive file's metadata by ID.
 */
async function getDriveFile(waId, fileId) {
  const client = createAuthenticatedClient(waId);
  if (!client) throw new Error('Google not connected. Use /gmail login first.');

  const driveApi = google.drive({ version: 'v3', auth: client });
  const res = await driveApi.files.get({
    fileId,
    fields: 'id, name, mimeType, size, modifiedTime, webViewLink',
  });

  return {
    id: res.data.id,
    name: res.data.name,
    mimeType: res.data.mimeType,
    size: res.data.size ? parseInt(res.data.size, 10) : 0,
    modifiedTime: res.data.modifiedTime,
    link: res.data.webViewLink || `https://drive.google.com/file/d/${res.data.id}/view`,
  };
}

// ── Public API: Sheets ───────────────────────────────────────────────────────

/**
 * Read data from a Google Sheet.
 * @param {string} waId
 * @param {string} spreadsheetId
 * @param {string} range - e.g. "Sheet1!A1:D10"
 */
async function readSheet(waId, spreadsheetId, range) {
  const client = createAuthenticatedClient(waId);
  if (!client) throw new Error('Google not connected. Use /gmail login first.');

  const sheets = google.sheets({ version: 'v4', auth: client });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  return {
    range: res.data.range,
    values: res.data.values || [],
  };
}

/**
 * Write data to a Google Sheet.
 * @param {string} waId
 * @param {string} spreadsheetId
 * @param {string} range - e.g. "Sheet1!A1"
 * @param {string[][]} values - 2D array of values
 */
async function writeSheet(waId, spreadsheetId, range, values) {
  const client = createAuthenticatedClient(waId);
  if (!client) throw new Error('Google not connected. Use /gmail login first.');

  const sheets = google.sheets({ version: 'v4', auth: client });
  const res = await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });

  return {
    updatedRange: res.data.updatedRange,
    updatedRows: res.data.updatedRows,
    updatedColumns: res.data.updatedColumns,
    updatedCells: res.data.updatedCells,
  };
}

/**
 * Create a new Google Sheet.
 * @param {string} waId
 * @param {string} title
 */
async function createSheet(waId, title) {
  const client = createAuthenticatedClient(waId);
  if (!client) throw new Error('Google not connected. Use /gmail login first.');

  const sheets = google.sheets({ version: 'v4', auth: client });
  const res = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title },
    },
  });

  return {
    id: res.data.spreadsheetId,
    title: res.data.properties.title,
    link: res.data.spreadsheetUrl,
  };
}

// ── Public API: Docs ─────────────────────────────────────────────────────────

/**
 * Read the text content of a Google Doc.
 * @param {string} waId
 * @param {string} documentId
 */
async function readDoc(waId, documentId) {
  const client = createAuthenticatedClient(waId);
  if (!client) throw new Error('Google not connected. Use /gmail login first.');

  const docs = google.docs({ version: 'v1', auth: client });
  const res = await docs.documents.get({ documentId });

  // Extract plain text from document body
  let text = '';
  const content = res.data.body?.content || [];
  for (const element of content) {
    if (element.paragraph) {
      for (const el of element.paragraph.elements || []) {
        if (el.textRun) {
          text += el.textRun.content;
        }
      }
    }
  }

  return {
    id: res.data.documentId,
    title: res.data.title,
    text,
    link: `https://docs.google.com/document/d/${res.data.documentId}/edit`,
  };
}

/**
 * Create a new Google Doc with optional initial text.
 * @param {string} waId
 * @param {string} title
 * @param {string} [body] - Optional initial text content
 */
async function createDoc(waId, title, body) {
  const client = createAuthenticatedClient(waId);
  if (!client) throw new Error('Google not connected. Use /gmail login first.');

  const docs = google.docs({ version: 'v1', auth: client });
  const res = await docs.documents.create({
    requestBody: { title },
  });

  const docId = res.data.documentId;

  // Insert body text if provided
  if (body) {
    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: {
        requests: [{
          insertText: {
            location: { index: 1 },
            text: body,
          },
        }],
      },
    });
  }

  return {
    id: docId,
    title: res.data.title,
    link: `https://docs.google.com/document/d/${docId}/edit`,
  };
}

// ── Status ───────────────────────────────────────────────────────────────────

/**
 * Get Google connection status for a user.
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
  // OAuth
  isConfigured,
  getAuthUrl,
  handleCallback,
  createAuthenticatedClient,
  getUserTokens,
  removeUserTokens,
  getStatus,
  // Gmail
  sendEmail,
  listEmails,
  getEmail,
  // Drive
  listDriveFiles,
  uploadToDrive,
  getDriveFile,
  // Sheets
  readSheet,
  writeSheet,
  createSheet,
  // Docs
  readDoc,
  createDoc,
};
