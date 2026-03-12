/**
 * GitHub App integration — connect user repos for the Website Manager agent.
 *
 * Users authenticate via /github (generates GitHub App install URL).
 * Installations are stored per-user in github-installations.json.
 * Installation tokens are ephemeral (1hr), generated on-demand, never persisted.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./logger');

const INSTALLATIONS_FILE = path.join(config.stateDir, 'github-installations.json');

// ── Installation persistence ─────────────────────────────────────────────────

function loadInstallations() {
  try {
    if (fs.existsSync(INSTALLATIONS_FILE)) {
      return JSON.parse(fs.readFileSync(INSTALLATIONS_FILE, 'utf8'));
    }
  } catch (e) {
    logger.warn('Failed to load GitHub installations:', e.message);
  }
  return {};
}

function saveInstallations(data) {
  try {
    fs.writeFileSync(INSTALLATIONS_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    logger.warn('Failed to save GitHub installations:', e.message);
  }
}

function getInstallation(waId) {
  return loadInstallations()[waId] || null;
}

function setInstallation(waId, installData) {
  const all = loadInstallations();
  all[waId] = installData;
  saveInstallations(all);
}

function removeInstallation(waId) {
  const all = loadInstallations();
  delete all[waId];
  saveInstallations(all);
}

// ── Config check ─────────────────────────────────────────────────────────────

function isConfigured() {
  return !!(config.githubAppId && config.githubPrivateKeyPath && config.githubClientId && config.githubClientSecret);
}

// ── JWT generation (authenticate as the GitHub App) ──────────────────────────

let _privateKey = null;

function getPrivateKey() {
  if (_privateKey) return _privateKey;
  try {
    _privateKey = fs.readFileSync(config.githubPrivateKeyPath, 'utf8');
    return _privateKey;
  } catch (e) {
    logger.error('Failed to read GitHub App private key:', e.message);
    return null;
  }
}

/**
 * Generate a JWT for authenticating as the GitHub App.
 * Valid for 10 minutes (GitHub max).
 */
function generateAppJWT() {
  const privateKey = getPrivateKey();
  if (!privateKey) throw new Error('GitHub App private key not found');

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: config.githubAppId,
    iat: now - 60,    // 60s clock skew allowance
    exp: now + 600,   // 10 min max
  };

  const encodeBase64Url = (obj) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url');

  const headerB64 = encodeBase64Url(header);
  const payloadB64 = encodeBase64Url(payload);
  const signingInput = `${headerB64}.${payloadB64}`;

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signingInput);
  const signature = sign.sign(privateKey, 'base64url');

  return `${signingInput}.${signature}`;
}

// ── OAuth state encryption (same pattern as google-auth.js) ──────────────────

function getEncryptionKey() {
  return crypto.createHash('sha256').update(config.metaAppSecret || 'github-oauth-fallback').digest();
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
      logger.warn('GitHub OAuth state expired');
      return null;
    }
    return payload;
  } catch (e) {
    logger.warn('Failed to decrypt GitHub OAuth state:', e.message);
    return null;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate the GitHub App installation URL with encrypted state.
 */
function getInstallUrl(waId) {
  const state = encryptState(waId);
  return `https://github.com/apps/${config.githubAppSlug}/installations/new?state=${encodeURIComponent(state)}`;
}

/**
 * Handle the OAuth callback after GitHub App installation.
 * Exchanges code for user info, stores installation mapping.
 * Returns { waId, account }.
 */
async function handleCallback(code, state, installationId) {
  const payload = decryptState(state);
  if (!payload) {
    throw new Error('Invalid or expired OAuth state. Please try /github again.');
  }

  // Exchange code for user access token (to get the GitHub username)
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      client_id: config.githubClientId,
      client_secret: config.githubClientSecret,
      code,
    }),
  });

  const tokenData = await tokenRes.json();
  if (tokenData.error) {
    throw new Error(`GitHub OAuth error: ${tokenData.error_description || tokenData.error}`);
  }

  // Get the user's GitHub username
  const userRes = await fetch('https://api.github.com/user', {
    headers: {
      'Authorization': `Bearer ${tokenData.access_token}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'Swayat-AI-Assistant',
    },
  });
  const userData = await userRes.json();

  const installData = {
    installationId: parseInt(installationId, 10),
    account: userData.login || 'unknown',
    accountId: userData.id,
    connectedAt: new Date().toISOString(),
  };

  setInstallation(payload.waId, installData);
  logger.info(`GitHub connected for ${payload.waId}: ${installData.account} (installation ${installationId})`);

  return { waId: payload.waId, account: installData.account };
}

/**
 * Generate a short-lived installation access token (valid 1 hour).
 * Never persisted — generated on-demand for each operation.
 */
async function generateInstallationToken(waId) {
  const install = getInstallation(waId);
  if (!install) throw new Error('GitHub not connected. Use /github to connect.');

  const jwt = generateAppJWT();
  const res = await fetch(
    `https://api.github.com/app/installations/${install.installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'Swayat-AI-Assistant',
      },
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Failed to generate GitHub token: ${err.message || res.statusText}`);
  }

  const data = await res.json();
  return { token: data.token, expiresAt: data.expires_at };
}

/**
 * List repos accessible to the user's GitHub App installation.
 */
async function listRepos(waId) {
  const { token } = await generateInstallationToken(waId);

  const res = await fetch('https://api.github.com/installation/repositories?per_page=100', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'Swayat-AI-Assistant',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to list repos: ${res.statusText}`);
  }

  const data = await res.json();
  return (data.repositories || []).map(r => ({
    fullName: r.full_name,
    name: r.name,
    private: r.private,
    defaultBranch: r.default_branch,
    cloneUrl: r.clone_url,
    htmlUrl: r.html_url,
  }));
}

/**
 * Get an authenticated HTTPS clone URL for a repo.
 */
async function getCloneUrl(waId, repoFullName) {
  const { token } = await generateInstallationToken(waId);
  return `https://x-access-token:${token}@github.com/${repoFullName}.git`;
}

/**
 * Get GitHub connection status for a user.
 */
function getStatus(waId) {
  const install = getInstallation(waId);
  if (!install) return { connected: false };
  return {
    connected: true,
    account: install.account,
    installationId: install.installationId,
    connectedAt: install.connectedAt,
  };
}

module.exports = {
  isConfigured,
  getInstallUrl,
  handleCallback,
  getInstallation,
  removeInstallation,
  getStatus,
  generateInstallationToken,
  listRepos,
  getCloneUrl,
  encryptState,
  decryptState,
};
