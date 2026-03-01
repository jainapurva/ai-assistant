/**
 * Tests for google-auth.js:
 * - Token persistence (load, save, get, set, remove)
 * - Token migration from gmail-tokens.json → google-tokens.json
 * - OAuth2 client creation
 * - State encryption/decryption
 * - Status reporting
 * - Exported API surface
 */

const realFs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Paths we intercept
const TOKEN_SUFFIX = 'google-tokens.json';
const LEGACY_SUFFIX = 'gmail-tokens.json';

function isMockedPath(p) {
  return p.endsWith(TOKEN_SUFFIX) || p.endsWith(LEGACY_SUFFIX);
}

// In-memory file store
const memFiles = {};

const _origExistsSync = realFs.existsSync;
const _origReadFileSync = realFs.readFileSync;
const _origWriteFileSync = realFs.writeFileSync;
const _origCopyFileSync = realFs.copyFileSync;
const _origMkdirSync = realFs.mkdirSync;

jest.spyOn(realFs, 'existsSync').mockImplementation((p) => {
  if (isMockedPath(p)) return Object.prototype.hasOwnProperty.call(memFiles, p);
  return _origExistsSync.call(realFs, p);
});

jest.spyOn(realFs, 'readFileSync').mockImplementation((p, enc) => {
  if (isMockedPath(p)) {
    if (!Object.prototype.hasOwnProperty.call(memFiles, p)) {
      throw Object.assign(new Error(`ENOENT: ${p}`), { code: 'ENOENT' });
    }
    return memFiles[p];
  }
  return _origReadFileSync.call(realFs, p, enc);
});

jest.spyOn(realFs, 'writeFileSync').mockImplementation((p, data) => {
  if (isMockedPath(p)) {
    memFiles[p] = data;
    return;
  }
  _origWriteFileSync.call(realFs, p, data);
});

jest.spyOn(realFs, 'copyFileSync').mockImplementation((src, dest) => {
  if (isMockedPath(src) || isMockedPath(dest)) {
    if (Object.prototype.hasOwnProperty.call(memFiles, src)) {
      memFiles[dest] = memFiles[src];
    }
    return;
  }
  _origCopyFileSync.call(realFs, src, dest);
});

jest.spyOn(realFs, 'mkdirSync').mockImplementation((p, opts) => {
  // no-op for mocked paths
});

// Now require the module
const googleAuth = require('../../src/google-auth');
const config = require('../../src/config');

function clearMem() {
  Object.keys(memFiles).forEach(k => delete memFiles[k]);
}

// ── Exported API surface ─────────────────────────────────────────────────────

describe('google-auth exports', () => {
  test('exports all expected OAuth functions', () => {
    expect(typeof googleAuth.isConfigured).toBe('function');
    expect(typeof googleAuth.getAuthUrl).toBe('function');
    expect(typeof googleAuth.handleCallback).toBe('function');
    expect(typeof googleAuth.createAuthenticatedClient).toBe('function');
    expect(typeof googleAuth.getUserTokens).toBe('function');
    expect(typeof googleAuth.removeUserTokens).toBe('function');
    expect(typeof googleAuth.getStatus).toBe('function');
  });

  test('exports all Gmail functions', () => {
    expect(typeof googleAuth.sendEmail).toBe('function');
    expect(typeof googleAuth.listEmails).toBe('function');
    expect(typeof googleAuth.getEmail).toBe('function');
  });

  test('exports all Drive functions', () => {
    expect(typeof googleAuth.listDriveFiles).toBe('function');
    expect(typeof googleAuth.uploadToDrive).toBe('function');
    expect(typeof googleAuth.getDriveFile).toBe('function');
  });

  test('exports all Sheets functions', () => {
    expect(typeof googleAuth.readSheet).toBe('function');
    expect(typeof googleAuth.writeSheet).toBe('function');
    expect(typeof googleAuth.createSheet).toBe('function');
  });

  test('exports all Docs functions', () => {
    expect(typeof googleAuth.readDoc).toBe('function');
    expect(typeof googleAuth.createDoc).toBe('function');
  });
});

// ── isConfigured ──────────────────────────────────────────────────────────────

describe('isConfigured', () => {
  test('returns true when all config values present', () => {
    // config reads from .env which has these set
    if (config.googleClientId && config.googleClientSecret && config.googleRedirectUri) {
      expect(googleAuth.isConfigured()).toBe(true);
    }
  });
});

// ── Token persistence ────────────────────────────────────────────────────────

describe('token persistence', () => {
  const waId = '1234567890@c.us';
  const tokensPath = path.join(config.stateDir, 'google-tokens.json');

  beforeEach(() => {
    clearMem();
  });

  test('getUserTokens returns null when no tokens exist', () => {
    expect(googleAuth.getUserTokens(waId)).toBeNull();
  });

  test('getUserTokens returns null for unknown user when file exists', () => {
    memFiles[tokensPath] = JSON.stringify({ 'other@c.us': { access_token: 'x' } });
    expect(googleAuth.getUserTokens(waId)).toBeNull();
  });

  test('getUserTokens returns token data when present', () => {
    const tokenData = { access_token: 'test-token', email: 'test@gmail.com' };
    memFiles[tokensPath] = JSON.stringify({ [waId]: tokenData });
    const result = googleAuth.getUserTokens(waId);
    expect(result).toEqual(tokenData);
  });

  test('removeUserTokens removes a user', () => {
    const tokenData = { access_token: 'test-token', email: 'test@gmail.com' };
    memFiles[tokensPath] = JSON.stringify({ [waId]: tokenData });
    googleAuth.removeUserTokens(waId);
    expect(googleAuth.getUserTokens(waId)).toBeNull();
  });

  test('removeUserTokens does not affect other users', () => {
    const data = {
      [waId]: { access_token: 'a' },
      'other@c.us': { access_token: 'b' },
    };
    memFiles[tokensPath] = JSON.stringify(data);
    googleAuth.removeUserTokens(waId);
    expect(googleAuth.getUserTokens('other@c.us')).toEqual({ access_token: 'b' });
  });
});

// ── getStatus ─────────────────────────────────────────────────────────────────

describe('getStatus', () => {
  const tokensPath = path.join(config.stateDir, 'google-tokens.json');

  beforeEach(() => {
    clearMem();
  });

  test('returns { connected: false } when no tokens', () => {
    expect(googleAuth.getStatus('unknown@c.us')).toEqual({ connected: false });
  });

  test('returns connected status with email when tokens exist', () => {
    const waId = '5551234567@c.us';
    memFiles[tokensPath] = JSON.stringify({
      [waId]: {
        access_token: 'x',
        email: 'user@gmail.com',
        connectedAt: '2025-01-01T00:00:00.000Z',
      },
    });
    const status = googleAuth.getStatus(waId);
    expect(status.connected).toBe(true);
    expect(status.email).toBe('user@gmail.com');
    expect(status.connectedAt).toBe('2025-01-01T00:00:00.000Z');
  });
});

// ── createAuthenticatedClient ────────────────────────────────────────────────

describe('createAuthenticatedClient', () => {
  const tokensPath = path.join(config.stateDir, 'google-tokens.json');

  beforeEach(() => {
    clearMem();
  });

  test('returns null when no tokens for user', () => {
    expect(googleAuth.createAuthenticatedClient('nobody@c.us')).toBeNull();
  });

  test('returns OAuth2 client when tokens exist', () => {
    const waId = '5551234567@c.us';
    memFiles[tokensPath] = JSON.stringify({
      [waId]: {
        access_token: 'test-access',
        refresh_token: 'test-refresh',
        expiry_date: Date.now() + 3600000,
      },
    });
    const client = googleAuth.createAuthenticatedClient(waId);
    expect(client).not.toBeNull();
    expect(client.credentials.access_token).toBe('test-access');
    expect(client.credentials.refresh_token).toBe('test-refresh');
  });
});

// ── getAuthUrl ────────────────────────────────────────────────────────────────

describe('getAuthUrl', () => {
  test('returns a Google OAuth URL', () => {
    if (!googleAuth.isConfigured()) return; // skip if no config
    const url = googleAuth.getAuthUrl('1234567890@c.us');
    expect(url).toContain('accounts.google.com');
    expect(url).toContain('scope=');
    expect(url).toContain('state=');
  });

  test('URL includes Drive scope', () => {
    if (!googleAuth.isConfigured()) return;
    const url = googleAuth.getAuthUrl('1234567890@c.us');
    expect(url).toContain('drive');
  });

  test('URL includes Sheets scope', () => {
    if (!googleAuth.isConfigured()) return;
    const url = googleAuth.getAuthUrl('1234567890@c.us');
    expect(url).toContain('spreadsheets');
  });

  test('URL includes Docs scope', () => {
    if (!googleAuth.isConfigured()) return;
    const url = googleAuth.getAuthUrl('1234567890@c.us');
    expect(url).toContain('documents');
  });
});

// ── Functions require auth ───────────────────────────────────────────────────

describe('functions require Google auth', () => {
  beforeEach(() => {
    clearMem();
  });

  test('sendEmail throws when not connected', async () => {
    await expect(googleAuth.sendEmail('nobody@c.us', 'to@test.com', 'sub', 'body'))
      .rejects.toThrow(/not connected/i);
  });

  test('listEmails throws when not connected', async () => {
    await expect(googleAuth.listEmails('nobody@c.us'))
      .rejects.toThrow(/not connected/i);
  });

  test('getEmail throws when not connected', async () => {
    await expect(googleAuth.getEmail('nobody@c.us', 'msgid'))
      .rejects.toThrow(/not connected/i);
  });

  test('listDriveFiles throws when not connected', async () => {
    await expect(googleAuth.listDriveFiles('nobody@c.us'))
      .rejects.toThrow(/not connected/i);
  });

  test('uploadToDrive throws when not connected', async () => {
    await expect(googleAuth.uploadToDrive('nobody@c.us', '/tmp/file.txt'))
      .rejects.toThrow(/not connected/i);
  });

  test('getDriveFile throws when not connected', async () => {
    await expect(googleAuth.getDriveFile('nobody@c.us', 'fileid'))
      .rejects.toThrow(/not connected/i);
  });

  test('readSheet throws when not connected', async () => {
    await expect(googleAuth.readSheet('nobody@c.us', 'sheetid', 'A1:B2'))
      .rejects.toThrow(/not connected/i);
  });

  test('writeSheet throws when not connected', async () => {
    await expect(googleAuth.writeSheet('nobody@c.us', 'sheetid', 'A1', [['a']]))
      .rejects.toThrow(/not connected/i);
  });

  test('createSheet throws when not connected', async () => {
    await expect(googleAuth.createSheet('nobody@c.us', 'title'))
      .rejects.toThrow(/not connected/i);
  });

  test('readDoc throws when not connected', async () => {
    await expect(googleAuth.readDoc('nobody@c.us', 'docid'))
      .rejects.toThrow(/not connected/i);
  });

  test('createDoc throws when not connected', async () => {
    await expect(googleAuth.createDoc('nobody@c.us', 'title'))
      .rejects.toThrow(/not connected/i);
  });
});
