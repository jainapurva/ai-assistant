/**
 * Tests for resend-auth.js:
 * - Key persistence (load, save, get, set, remove)
 * - Status reporting
 * - API key resolution
 * - Key validation (mocked fetch)
 * - Exported API surface
 */

const realFs = require('fs');
const path = require('path');

// Path we intercept
const KEY_SUFFIX = 'resend-keys.json';

function isMockedPath(p) {
  return p.endsWith(KEY_SUFFIX);
}

// In-memory file store
const memFiles = {};

const _origExistsSync = realFs.existsSync;
const _origReadFileSync = realFs.readFileSync;
const _origWriteFileSync = realFs.writeFileSync;

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

// Now require the module
const resendAuth = require('../../src/resend-auth');
const config = require('../../src/config');

const keysPath = path.join(config.stateDir, 'resend-keys.json');

function clearMem() {
  Object.keys(memFiles).forEach(k => delete memFiles[k]);
}

// ── Exported API surface ─────────────────────────────────────────────────────

describe('resend-auth exports', () => {
  test('exports all expected functions', () => {
    expect(typeof resendAuth.getUserKey).toBe('function');
    expect(typeof resendAuth.setUserKey).toBe('function');
    expect(typeof resendAuth.removeUserKey).toBe('function');
    expect(typeof resendAuth.isUserConnected).toBe('function');
    expect(typeof resendAuth.getStatus).toBe('function');
    expect(typeof resendAuth.resolveApiKey).toBe('function');
    expect(typeof resendAuth.validateKey).toBe('function');
  });

  test('exports KEYS_FILE path', () => {
    expect(resendAuth.KEYS_FILE).toContain('resend-keys.json');
  });
});

// ── Key persistence ────────────────────────────────────────────────────────

describe('key persistence', () => {
  const waId = '1234567890@c.us';

  beforeEach(() => {
    clearMem();
  });

  test('getUserKey returns null when no keys file exists', () => {
    expect(resendAuth.getUserKey(waId)).toBeNull();
  });

  test('getUserKey returns null for unknown user when file exists', () => {
    memFiles[keysPath] = JSON.stringify({ 'other@c.us': { apiKey: 're_xxx' } });
    expect(resendAuth.getUserKey(waId)).toBeNull();
  });

  test('getUserKey returns key data when present', () => {
    const keyData = { apiKey: 're_test_key', connectedAt: '2026-03-01T00:00:00.000Z' };
    memFiles[keysPath] = JSON.stringify({ [waId]: keyData });
    expect(resendAuth.getUserKey(waId)).toEqual(keyData);
  });

  test('setUserKey stores and retrieves correctly', () => {
    const keyData = { apiKey: 're_new_key', connectedAt: '2026-03-01T00:00:00.000Z' };
    resendAuth.setUserKey(waId, keyData);
    expect(resendAuth.getUserKey(waId)).toEqual(keyData);
  });

  test('removeUserKey removes a user', () => {
    const keyData = { apiKey: 're_test_key', connectedAt: '2026-03-01T00:00:00.000Z' };
    memFiles[keysPath] = JSON.stringify({ [waId]: keyData });
    resendAuth.removeUserKey(waId);
    expect(resendAuth.getUserKey(waId)).toBeNull();
  });

  test('removeUserKey does not affect other users', () => {
    const data = {
      [waId]: { apiKey: 're_aaa' },
      'other@c.us': { apiKey: 're_bbb' },
    };
    memFiles[keysPath] = JSON.stringify(data);
    resendAuth.removeUserKey(waId);
    expect(resendAuth.getUserKey('other@c.us')).toEqual({ apiKey: 're_bbb' });
  });
});

// ── isUserConnected ──────────────────────────────────────────────────────────

describe('isUserConnected', () => {
  beforeEach(() => { clearMem(); });

  test('returns false when no key', () => {
    expect(resendAuth.isUserConnected('unknown@c.us')).toBe(false);
  });

  test('returns true when key exists', () => {
    memFiles[keysPath] = JSON.stringify({ 'user@c.us': { apiKey: 're_x' } });
    expect(resendAuth.isUserConnected('user@c.us')).toBe(true);
  });
});

// ── getStatus ─────────────────────────────────────────────────────────────────

describe('getStatus', () => {
  beforeEach(() => { clearMem(); });

  test('returns { connected: false } when no key', () => {
    expect(resendAuth.getStatus('unknown@c.us')).toEqual({ connected: false });
  });

  test('returns connected status with connectedAt when key exists', () => {
    memFiles[keysPath] = JSON.stringify({
      'user@c.us': { apiKey: 're_secret', connectedAt: '2026-01-15T00:00:00.000Z' },
    });
    const status = resendAuth.getStatus('user@c.us');
    expect(status.connected).toBe(true);
    expect(status.connectedAt).toBe('2026-01-15T00:00:00.000Z');
  });

  test('does NOT expose the API key in status', () => {
    memFiles[keysPath] = JSON.stringify({
      'user@c.us': { apiKey: 're_secret', connectedAt: '2026-01-15T00:00:00.000Z' },
    });
    const status = resendAuth.getStatus('user@c.us');
    expect(status.apiKey).toBeUndefined();
    expect(JSON.stringify(status)).not.toContain('re_secret');
  });
});

// ── resolveApiKey ──────────────────────────────────────────────────────────

describe('resolveApiKey', () => {
  beforeEach(() => { clearMem(); });

  test('returns API key string when user has a key', () => {
    memFiles[keysPath] = JSON.stringify({
      'user@c.us': { apiKey: 're_my_key_123' },
    });
    expect(resendAuth.resolveApiKey('user@c.us')).toBe('re_my_key_123');
  });

  test('returns null when user has no key', () => {
    expect(resendAuth.resolveApiKey('nobody@c.us')).toBeNull();
  });
});

// ── validateKey ──────────────────────────────────────────────────────────────

describe('validateKey', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('returns valid with domains on 200 OK', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ name: 'example.com', status: 'verified' }] }),
    });
    const result = await resendAuth.validateKey('re_valid_key');
    expect(result.valid).toBe(true);
    expect(result.domains).toEqual([{ name: 'example.com', status: 'verified' }]);
    expect(global.fetch).toHaveBeenCalledWith('https://api.resend.com/domains', {
      headers: { Authorization: 'Bearer re_valid_key' },
    });
  });

  test('returns invalid on 401 response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    });
    const result = await resendAuth.validateKey('re_bad_key');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('401');
  });

  test('returns invalid on network error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network failure'));
    const result = await resendAuth.validateKey('re_any_key');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Network failure');
  });
});
