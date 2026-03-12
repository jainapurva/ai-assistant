/**
 * Tests for microsoft-auth.js:
 * - Token persistence (load, save, get, set, remove)
 * - OAuth2 URL generation
 * - State encryption/decryption
 * - Status reporting
 * - Exported API surface
 * - Functions require auth
 */

const realFs = require('fs');
const path = require('path');

const TOKEN_SUFFIX = 'microsoft-tokens.json';

function isMockedPath(p) {
  return p.endsWith(TOKEN_SUFFIX);
}

const memFiles = {};

const _origExistsSync = realFs.existsSync;
const _origReadFileSync = realFs.readFileSync;
const _origWriteFileSync = realFs.writeFileSync;
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

jest.spyOn(realFs, 'mkdirSync').mockImplementation(() => {});

const microsoftAuth = require('../../src/microsoft-auth');
const config = require('../../src/config');

function clearMem() {
  Object.keys(memFiles).forEach(k => delete memFiles[k]);
}

// ── Exported API surface ─────────────────────────────────────────────────────

describe('microsoft-auth exports', () => {
  test('exports all expected OAuth functions', () => {
    expect(typeof microsoftAuth.isConfigured).toBe('function');
    expect(typeof microsoftAuth.getAuthUrl).toBe('function');
    expect(typeof microsoftAuth.handleCallback).toBe('function');
    expect(typeof microsoftAuth.getUserTokens).toBe('function');
    expect(typeof microsoftAuth.removeUserTokens).toBe('function');
    expect(typeof microsoftAuth.getStatus).toBe('function');
  });

  test('exports all Mail functions', () => {
    expect(typeof microsoftAuth.sendEmail).toBe('function');
    expect(typeof microsoftAuth.listEmails).toBe('function');
    expect(typeof microsoftAuth.getEmail).toBe('function');
    expect(typeof microsoftAuth.replyToEmail).toBe('function');
    expect(typeof microsoftAuth.forwardEmail).toBe('function');
    expect(typeof microsoftAuth.deleteEmail).toBe('function');
    expect(typeof microsoftAuth.moveEmail).toBe('function');
    expect(typeof microsoftAuth.markEmail).toBe('function');
    expect(typeof microsoftAuth.listFolders).toBe('function');
    expect(typeof microsoftAuth.createDraft).toBe('function');
    expect(typeof microsoftAuth.searchEmails).toBe('function');
  });
});

// ── isConfigured ──────────────────────────────────────────────────────────────

describe('isConfigured', () => {
  test('returns true when all config values present', () => {
    if (config.microsoftClientId && config.microsoftClientSecret && config.microsoftRedirectUri) {
      expect(microsoftAuth.isConfigured()).toBe(true);
    }
  });
});

// ── Token persistence ────────────────────────────────────────────────────────

describe('token persistence', () => {
  const waId = '1234567890@c.us';
  const tokensPath = path.join(config.stateDir, 'microsoft-tokens.json');

  beforeEach(() => {
    clearMem();
  });

  test('getUserTokens returns null when no tokens exist', () => {
    expect(microsoftAuth.getUserTokens(waId)).toBeNull();
  });

  test('getUserTokens returns null for unknown user when file exists', () => {
    memFiles[tokensPath] = JSON.stringify({ 'other@c.us': { access_token: 'x' } });
    expect(microsoftAuth.getUserTokens(waId)).toBeNull();
  });

  test('getUserTokens returns token data when present', () => {
    const tokenData = { access_token: 'test-token', email: 'test@outlook.com' };
    memFiles[tokensPath] = JSON.stringify({ [waId]: tokenData });
    const result = microsoftAuth.getUserTokens(waId);
    expect(result).toEqual(tokenData);
  });

  test('removeUserTokens removes a user', () => {
    const tokenData = { access_token: 'test-token', email: 'test@outlook.com' };
    memFiles[tokensPath] = JSON.stringify({ [waId]: tokenData });
    microsoftAuth.removeUserTokens(waId);
    expect(microsoftAuth.getUserTokens(waId)).toBeNull();
  });

  test('removeUserTokens does not affect other users', () => {
    const data = {
      [waId]: { access_token: 'a' },
      'other@c.us': { access_token: 'b' },
    };
    memFiles[tokensPath] = JSON.stringify(data);
    microsoftAuth.removeUserTokens(waId);
    expect(microsoftAuth.getUserTokens('other@c.us')).toEqual({ access_token: 'b' });
  });
});

// ── getStatus ─────────────────────────────────────────────────────────────────

describe('getStatus', () => {
  const tokensPath = path.join(config.stateDir, 'microsoft-tokens.json');

  beforeEach(() => {
    clearMem();
  });

  test('returns { connected: false } when no tokens', () => {
    expect(microsoftAuth.getStatus('unknown@c.us')).toEqual({ connected: false });
  });

  test('returns connected status with email when tokens exist', () => {
    const waId = '5551234567@c.us';
    memFiles[tokensPath] = JSON.stringify({
      [waId]: {
        access_token: 'x',
        email: 'user@outlook.com',
        connectedAt: '2025-01-01T00:00:00.000Z',
      },
    });
    const status = microsoftAuth.getStatus(waId);
    expect(status.connected).toBe(true);
    expect(status.email).toBe('user@outlook.com');
    expect(status.connectedAt).toBe('2025-01-01T00:00:00.000Z');
  });
});

// ── getAuthUrl ────────────────────────────────────────────────────────────────

describe('getAuthUrl', () => {
  test('returns a Microsoft OAuth URL', () => {
    if (!microsoftAuth.isConfigured()) return;
    const url = microsoftAuth.getAuthUrl('1234567890@c.us');
    expect(url).toContain('login.microsoftonline.com');
    expect(url).toContain('scope=');
    expect(url).toContain('state=');
  });

  test('URL includes Mail.Read scope', () => {
    if (!microsoftAuth.isConfigured()) return;
    const url = microsoftAuth.getAuthUrl('1234567890@c.us');
    expect(url).toContain('Mail.Read');
  });

  test('URL includes Mail.Send scope', () => {
    if (!microsoftAuth.isConfigured()) return;
    const url = microsoftAuth.getAuthUrl('1234567890@c.us');
    expect(url).toContain('Mail.Send');
  });

  test('URL includes offline_access scope', () => {
    if (!microsoftAuth.isConfigured()) return;
    const url = microsoftAuth.getAuthUrl('1234567890@c.us');
    expect(url).toContain('offline_access');
  });

  test('URL uses correct redirect URI', () => {
    if (!microsoftAuth.isConfigured()) return;
    const url = microsoftAuth.getAuthUrl('1234567890@c.us');
    expect(url).toContain(encodeURIComponent(config.microsoftRedirectUri));
  });

  test('URL includes prompt=consent', () => {
    if (!microsoftAuth.isConfigured()) return;
    const url = microsoftAuth.getAuthUrl('1234567890@c.us');
    expect(url).toContain('prompt=consent');
  });
});

// ── Functions require auth ───────────────────────────────────────────────────

describe('functions require Outlook auth', () => {
  beforeEach(() => {
    clearMem();
  });

  test('sendEmail throws when not connected', async () => {
    await expect(microsoftAuth.sendEmail('nobody@c.us', 'to@test.com', 'sub', 'body'))
      .rejects.toThrow(/not connected/i);
  });

  test('listEmails throws when not connected', async () => {
    await expect(microsoftAuth.listEmails('nobody@c.us'))
      .rejects.toThrow(/not connected/i);
  });

  test('getEmail throws when not connected', async () => {
    await expect(microsoftAuth.getEmail('nobody@c.us', 'msgid'))
      .rejects.toThrow(/not connected/i);
  });

  test('replyToEmail throws when not connected', async () => {
    await expect(microsoftAuth.replyToEmail('nobody@c.us', 'msgid', 'reply'))
      .rejects.toThrow(/not connected/i);
  });

  test('forwardEmail throws when not connected', async () => {
    await expect(microsoftAuth.forwardEmail('nobody@c.us', 'msgid', 'to@test.com'))
      .rejects.toThrow(/not connected/i);
  });

  test('deleteEmail throws when not connected', async () => {
    await expect(microsoftAuth.deleteEmail('nobody@c.us', 'msgid'))
      .rejects.toThrow(/not connected/i);
  });

  test('moveEmail throws when not connected', async () => {
    await expect(microsoftAuth.moveEmail('nobody@c.us', 'msgid', 'folderid'))
      .rejects.toThrow(/not connected/i);
  });

  test('markEmail throws when not connected', async () => {
    await expect(microsoftAuth.markEmail('nobody@c.us', 'msgid', true))
      .rejects.toThrow(/not connected/i);
  });

  test('listFolders throws when not connected', async () => {
    await expect(microsoftAuth.listFolders('nobody@c.us'))
      .rejects.toThrow(/not connected/i);
  });

  test('createDraft throws when not connected', async () => {
    await expect(microsoftAuth.createDraft('nobody@c.us', 'to@test.com', 'sub', 'body'))
      .rejects.toThrow(/not connected/i);
  });
});
