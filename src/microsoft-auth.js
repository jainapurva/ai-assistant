/**
 * Microsoft OAuth2 — Outlook Mail via Microsoft Graph API.
 *
 * Users authenticate via /outlook login (generates OAuth consent URL).
 * Tokens are stored per-user in microsoft-tokens.json.
 * Supports: Mail (send, list/search inbox, read, reply, forward, delete/archive, manage folders).
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./logger');

const TOKENS_FILE = path.join(config.stateDir, 'microsoft-tokens.json');

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const AUTH_BASE = 'https://login.microsoftonline.com/common/oauth2/v2.0';

const MICROSOFT_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'Mail.Read',
  'Mail.ReadWrite',
  'Mail.Send',
  'User.Read',
];

// ── Token persistence ────────────────────────────────────────────────────────

function loadTokens() {
  try {
    if (fs.existsSync(TOKENS_FILE)) {
      return JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
    }
  } catch (e) {
    logger.warn('Failed to load Microsoft tokens:', e.message);
  }
  return {};
}

function saveTokens(tokens) {
  try {
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
  } catch (e) {
    logger.warn('Failed to save Microsoft tokens:', e.message);
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

// ── OAuth2 helpers ───────────────────────────────────────────────────────────

function isConfigured() {
  return !!(config.microsoftClientId && config.microsoftClientSecret && config.microsoftRedirectUri);
}

function getEncryptionKey() {
  return crypto.createHash('sha256').update(config.metaAppSecret || 'microsoft-oauth-fallback').digest();
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

    if (Date.now() - payload.ts > 10 * 60 * 1000) {
      logger.warn('Microsoft OAuth state expired');
      return null;
    }
    return payload;
  } catch (e) {
    logger.warn('Failed to decrypt Microsoft OAuth state:', e.message);
    return null;
  }
}

// ── Graph API helper ─────────────────────────────────────────────────────────

/**
 * Make an authenticated request to Microsoft Graph API.
 * Auto-refreshes tokens if expired.
 */
async function graphFetch(waId, endpoint, options = {}) {
  let tokenData = getUserTokens(waId);
  if (!tokenData) throw new Error('Outlook not connected. Use /outlook login first.');

  // Auto-refresh if token is expired (or will expire in 5 min)
  if (tokenData.expiry_date && Date.now() > tokenData.expiry_date - 5 * 60 * 1000) {
    tokenData = await refreshTokens(waId, tokenData);
  }

  const url = endpoint.startsWith('http') ? endpoint : `${GRAPH_BASE}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${tokenData.access_token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (res.status === 401) {
    // Token might have been revoked — try one refresh
    tokenData = await refreshTokens(waId, tokenData);
    const retry = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    if (!retry.ok) {
      const errText = await retry.text();
      throw new Error(`Graph API error ${retry.status}: ${errText.slice(0, 300)}`);
    }
    return retry.status === 204 ? null : retry.json();
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Graph API error ${res.status}: ${errText.slice(0, 300)}`);
  }

  return res.status === 204 ? null : res.json();
}

/**
 * Refresh access token using refresh_token.
 */
async function refreshTokens(waId, tokenData) {
  if (!tokenData.refresh_token) {
    throw new Error('No refresh token available. Please /outlook login again.');
  }

  const body = new URLSearchParams({
    client_id: config.microsoftClientId,
    client_secret: config.microsoftClientSecret,
    refresh_token: tokenData.refresh_token,
    grant_type: 'refresh_token',
    scope: MICROSOFT_SCOPES.join(' '),
  });

  const res = await fetch(`${AUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    logger.error(`Microsoft token refresh failed for ${waId}:`, errText);
    throw new Error('Token refresh failed. Please /outlook login again.');
  }

  const data = await res.json();

  const updated = {
    ...tokenData,
    access_token: data.access_token,
    expiry_date: Date.now() + (data.expires_in * 1000),
  };
  if (data.refresh_token) updated.refresh_token = data.refresh_token;

  setUserTokens(waId, updated);
  logger.info(`Microsoft tokens refreshed for ${waId}`);
  return updated;
}

// ── Public API: OAuth ────────────────────────────────────────────────────────

function getAuthUrl(waId) {
  const state = encryptState(waId);
  const params = new URLSearchParams({
    client_id: config.microsoftClientId,
    response_type: 'code',
    redirect_uri: config.microsoftRedirectUri,
    response_mode: 'query',
    scope: MICROSOFT_SCOPES.join(' '),
    state,
    prompt: 'consent',
  });
  return `${AUTH_BASE}/authorize?${params.toString()}`;
}

async function handleCallback(code, state) {
  const payload = decryptState(state);
  if (!payload) {
    throw new Error('Invalid or expired OAuth state. Please try /outlook login again.');
  }

  const body = new URLSearchParams({
    client_id: config.microsoftClientId,
    client_secret: config.microsoftClientSecret,
    code,
    redirect_uri: config.microsoftRedirectUri,
    grant_type: 'authorization_code',
    scope: MICROSOFT_SCOPES.join(' '),
  });

  const tokenRes = await fetch(`${AUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`Token exchange failed: ${errText.slice(0, 300)}`);
  }

  const tokens = await tokenRes.json();

  // Get user profile to find email
  const profileRes = await fetch(`${GRAPH_BASE}/me`, {
    headers: { 'Authorization': `Bearer ${tokens.access_token}` },
  });

  if (!profileRes.ok) {
    throw new Error('Failed to fetch user profile.');
  }

  const profile = await profileRes.json();
  const email = profile.mail || profile.userPrincipalName;

  setUserTokens(payload.waId, {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: Date.now() + (tokens.expires_in * 1000),
    email,
    scope: tokens.scope,
    connectedAt: new Date().toISOString(),
  });

  logger.info(`Microsoft connected for ${payload.waId}: ${email}`);
  return { waId: payload.waId, email };
}

// ── Public API: Mail ─────────────────────────────────────────────────────────

/**
 * Send an email via Outlook.
 */
async function sendEmail(waId, to, subject, body, options = {}) {
  const tokenData = getUserTokens(waId);
  if (!tokenData) throw new Error('Outlook not connected. Use /outlook login first.');

  const toRecipients = to.split(',').map(addr => ({
    emailAddress: { address: addr.trim() },
  }));

  const message = {
    subject,
    body: {
      contentType: options.html ? 'HTML' : 'Text',
      content: body,
    },
    toRecipients,
  };

  if (options.cc) {
    message.ccRecipients = options.cc.split(',').map(addr => ({
      emailAddress: { address: addr.trim() },
    }));
  }

  if (options.bcc) {
    message.bccRecipients = options.bcc.split(',').map(addr => ({
      emailAddress: { address: addr.trim() },
    }));
  }

  await graphFetch(waId, '/me/sendMail', {
    method: 'POST',
    body: JSON.stringify({ message, saveToSentItems: true }),
  });

  logger.info(`Outlook: email sent by ${waId} to ${to}`);
  return { from: tokenData.email, to, subject };
}

/**
 * List/search emails in the user's mailbox.
 */
async function listEmails(waId, query, maxResults = 10, folderId = null) {
  let endpoint = folderId
    ? `/me/mailFolders/${folderId}/messages`
    : '/me/messages';

  const params = new URLSearchParams({
    '$top': String(maxResults),
    '$orderby': 'receivedDateTime desc',
    '$select': 'id,subject,from,toRecipients,receivedDateTime,bodyPreview,isRead',
  });

  if (query) {
    params.set('$search', `"${query}"`);
    params.delete('$orderby'); // $search and $orderby can't be combined
  }

  const data = await graphFetch(waId, `${endpoint}?${params.toString()}`);

  return (data.value || []).map(m => ({
    id: m.id,
    from: m.from ? m.from.emailAddress.address : '',
    fromName: m.from ? m.from.emailAddress.name : '',
    to: (m.toRecipients || []).map(r => r.emailAddress.address).join(', '),
    subject: m.subject || '',
    date: m.receivedDateTime || '',
    snippet: m.bodyPreview || '',
    isRead: m.isRead,
  }));
}

/**
 * Read a specific email by ID.
 */
async function getEmail(waId, messageId) {
  const m = await graphFetch(waId, `/me/messages/${messageId}?$select=id,subject,from,toRecipients,ccRecipients,receivedDateTime,body,isRead`);

  // Extract text from HTML body
  let bodyText = m.body.content || '';
  if (m.body.contentType === 'html') {
    // Basic HTML to text: strip tags
    bodyText = bodyText
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  return {
    id: m.id,
    from: m.from ? m.from.emailAddress.address : '',
    fromName: m.from ? m.from.emailAddress.name : '',
    to: (m.toRecipients || []).map(r => r.emailAddress.address).join(', '),
    cc: (m.ccRecipients || []).map(r => r.emailAddress.address).join(', '),
    subject: m.subject || '',
    date: m.receivedDateTime || '',
    body: bodyText,
    isRead: m.isRead,
  };
}

/**
 * Reply to an email.
 */
async function replyToEmail(waId, messageId, comment) {
  await graphFetch(waId, `/me/messages/${messageId}/reply`, {
    method: 'POST',
    body: JSON.stringify({ comment }),
  });
  logger.info(`Outlook: reply sent by ${waId} to message ${messageId}`);
  return { status: 'replied', messageId };
}

/**
 * Forward an email.
 */
async function forwardEmail(waId, messageId, to, comment = '') {
  const toRecipients = to.split(',').map(addr => ({
    emailAddress: { address: addr.trim() },
  }));

  await graphFetch(waId, `/me/messages/${messageId}/forward`, {
    method: 'POST',
    body: JSON.stringify({ comment, toRecipients }),
  });
  logger.info(`Outlook: forwarded by ${waId} message ${messageId} to ${to}`);
  return { status: 'forwarded', messageId, to };
}

/**
 * Delete an email (move to Deleted Items).
 */
async function deleteEmail(waId, messageId) {
  await graphFetch(waId, `/me/messages/${messageId}`, {
    method: 'DELETE',
  });
  logger.info(`Outlook: deleted message ${messageId} for ${waId}`);
  return { status: 'deleted', messageId };
}

/**
 * Move an email to a folder.
 */
async function moveEmail(waId, messageId, destinationFolderId) {
  const result = await graphFetch(waId, `/me/messages/${messageId}/move`, {
    method: 'POST',
    body: JSON.stringify({ destinationId: destinationFolderId }),
  });
  return { status: 'moved', messageId, newId: result.id };
}

/**
 * Mark email as read/unread.
 */
async function markEmail(waId, messageId, isRead) {
  await graphFetch(waId, `/me/messages/${messageId}`, {
    method: 'PATCH',
    body: JSON.stringify({ isRead }),
  });
  return { status: isRead ? 'marked_read' : 'marked_unread', messageId };
}

/**
 * List mail folders.
 */
async function listFolders(waId) {
  const data = await graphFetch(waId, '/me/mailFolders?$top=50');
  return (data.value || []).map(f => ({
    id: f.id,
    name: f.displayName,
    totalCount: f.totalItemCount,
    unreadCount: f.unreadItemCount,
  }));
}

/**
 * Create a draft email.
 */
async function createDraft(waId, to, subject, body, options = {}) {
  const toRecipients = to.split(',').map(addr => ({
    emailAddress: { address: addr.trim() },
  }));

  const message = {
    subject,
    body: {
      contentType: options.html ? 'HTML' : 'Text',
      content: body,
    },
    toRecipients,
  };

  const result = await graphFetch(waId, '/me/messages', {
    method: 'POST',
    body: JSON.stringify(message),
  });

  logger.info(`Outlook: draft created by ${waId}`);
  return { id: result.id, subject, to };
}

/**
 * Search emails with advanced query.
 */
async function searchEmails(waId, query, maxResults = 10) {
  return listEmails(waId, query, maxResults);
}

// ── Status ───────────────────────────────────────────────────────────────────

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
  getUserTokens,
  removeUserTokens,
  getStatus,
  // Mail
  sendEmail,
  listEmails,
  getEmail,
  replyToEmail,
  forwardEmail,
  deleteEmail,
  moveEmail,
  markEmail,
  listFolders,
  createDraft,
  searchEmails,
};
