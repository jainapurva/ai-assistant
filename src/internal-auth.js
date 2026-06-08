/**
 * Internal API authentication.
 *
 * The bot's internal HTTP API (port 5153) exposes per-user endpoints that act on
 * a caller-supplied `chatId` (Gmail, Drive, Sheets, Outlook, GitHub, Shopify…).
 * Historically these were unauthenticated, so anyone able to reach the port could
 * read any user's connected-account data by passing their chatId.
 *
 * We now require a per-chat token on those routes:
 *   token = HMAC-SHA256(INTERNAL_API_SECRET, chatId)
 *
 * The bot mints a token for each MCP server it spawns (bound to that session's
 * chatId) and the API verifies `token === HMAC(secret, body.chatId)`. Because the
 * token is bound to one chatId, a token minted for user A cannot be used to query
 * user B, and without the secret no token can be forged.
 */

const crypto = require('crypto');
const config = require('./config');

// URL prefixes that operate on a specific user's connected account and therefore
// require a valid per-chat token. Everything else (e.g. /send, /health) is left
// open for the webhook/website callers.
const PROTECTED_PREFIXES = [
  '/gmail/', '/drive/', '/sheets/', '/docs/',
  '/outlook/', '/github/', '/shopify/', '/freetools/',
  '/jobs/', '/schedule/', '/heartbeat/',
];

function isProtectedPath(url) {
  if (!url) return false;
  const path = String(url).split('?')[0];
  return PROTECTED_PREFIXES.some(p => path.startsWith(p));
}

// Per-chat token. Returns '' when no secret/chatId so callers degrade predictably.
function tokenFor(chatId) {
  const secret = config.internalApiSecret;
  if (!secret || !chatId) return '';
  return crypto.createHmac('sha256', secret).update(String(chatId)).digest('hex');
}

// Constant-time verification of a presented token against the expected one for chatId.
// Fails open ONLY when no secret is configured (avoids bricking all integrations on a
// misconfig) — that case is logged by the caller. With a secret set, this fails closed.
function verify(chatId, token) {
  const secret = config.internalApiSecret;
  if (!secret) return true;
  if (!chatId || !token) return false;
  const expected = tokenFor(chatId);
  const got = String(token);
  if (expected.length !== got.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
  } catch {
    return false;
  }
}

function isConfigured() {
  return !!config.internalApiSecret;
}

// ── Service-to-service auth (port-3000 routes) ──────────────────────────────
// Website backend + provisioning callers authenticate with a single static
// secret (x-api-key), not a per-chat token, since they legitimately act for
// many users (e.g. /setup-agent for any new signup).

const SERVICE_PROTECTED_PREFIXES = ['/setup-agent', '/send-template', '/send', '/host-subdomain'];

function isServiceProtectedPath(url) {
  if (!url) return false;
  const path = String(url).split('?')[0];
  return SERVICE_PROTECTED_PREFIXES.some(p => path === p || path.startsWith(p + '/'));
}

// Constant-time check of a presented service key. Fails open ONLY when no
// secret is configured (logged at startup), to avoid bricking signup on misconfig.
function verifyService(presented) {
  const secret = config.serviceApiSecret;
  if (!secret) return true;
  if (!presented) return false;
  const got = String(presented);
  if (got.length !== secret.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(secret));
  } catch {
    return false;
  }
}

function isServiceConfigured() {
  return !!config.serviceApiSecret;
}

module.exports = {
  isProtectedPath, tokenFor, verify, isConfigured, PROTECTED_PREFIXES,
  isServiceProtectedPath, verifyService, isServiceConfigured, SERVICE_PROTECTED_PREFIXES,
};
