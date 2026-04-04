/**
 * Tests for github-auth.js:
 * - Installation persistence (load, save, get, set, remove)
 * - OAuth/install URL generation
 * - State encryption/decryption
 * - Status reporting
 * - Exported API surface
 * - Functions require auth
 * - handleCallback with mocked fetch
 * - generateInstallationToken with mocked fetch
 */

const realFs = require('fs');
const path = require('path');

const INSTALL_SUFFIX = 'github-installations.json';
const KEY_FILENAME = 'github-app-private-key.pem';

function isMockedPath(p) {
  return p.endsWith(INSTALL_SUFFIX);
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

const githubAuth = require('../../src/github-auth');
const config = require('../../src/config');

function clearMem() {
  Object.keys(memFiles).forEach(k => delete memFiles[k]);
}

// ── Exported API surface ─────────────────────────────────────────────────────

describe('github-auth exports', () => {
  test('exports all expected OAuth functions', () => {
    expect(typeof githubAuth.isConfigured).toBe('function');
    expect(typeof githubAuth.getInstallUrl).toBe('function');
    expect(typeof githubAuth.handleCallback).toBe('function');
    expect(typeof githubAuth.getInstallation).toBe('function');
    expect(typeof githubAuth.removeInstallation).toBe('function');
    expect(typeof githubAuth.getStatus).toBe('function');
  });

  test('exports GitHub-specific functions', () => {
    expect(typeof githubAuth.generateInstallationToken).toBe('function');
    expect(typeof githubAuth.listRepos).toBe('function');
    expect(typeof githubAuth.getCloneUrl).toBe('function');
    expect(typeof githubAuth.encryptState).toBe('function');
    expect(typeof githubAuth.decryptState).toBe('function');
  });
});

// ── isConfigured ──────────────────────────────────────────────────────────────

describe('isConfigured', () => {
  test('returns true when all config values present', () => {
    if (config.githubAppId && config.githubPrivateKeyPath && config.githubClientId && config.githubClientSecret) {
      expect(githubAuth.isConfigured()).toBe(true);
    }
  });
});

// ── Installation persistence ─────────────────────────────────────────────────

describe('installation persistence', () => {
  const waId = '1234567890@c.us';
  const installPath = path.join(config.stateDir, 'github-installations.json');

  beforeEach(() => {
    clearMem();
  });

  test('getInstallation returns null when no installations exist', () => {
    expect(githubAuth.getInstallation(waId)).toBeNull();
  });

  test('getInstallation returns null for unknown user when file exists', () => {
    memFiles[installPath] = JSON.stringify({ 'other@c.us': { installationId: 123 } });
    expect(githubAuth.getInstallation(waId)).toBeNull();
  });

  test('getInstallation returns data when present', () => {
    const installData = { installationId: 456, account: 'testuser', connectedAt: '2026-01-01T00:00:00Z' };
    memFiles[installPath] = JSON.stringify({ [waId]: installData });
    const result = githubAuth.getInstallation(waId);
    expect(result).toEqual(installData);
  });

  test('removeInstallation removes a user', () => {
    const installData = { installationId: 456, account: 'testuser' };
    memFiles[installPath] = JSON.stringify({ [waId]: installData });
    githubAuth.removeInstallation(waId);
    expect(githubAuth.getInstallation(waId)).toBeNull();
  });

  test('removeInstallation does not affect other users', () => {
    const data = {
      [waId]: { installationId: 1 },
      'other@c.us': { installationId: 2 },
    };
    memFiles[installPath] = JSON.stringify(data);
    githubAuth.removeInstallation(waId);
    expect(githubAuth.getInstallation('other@c.us')).toEqual({ installationId: 2 });
  });
});

// ── getStatus ─────────────────────────────────────────────────────────────────

describe('getStatus', () => {
  const installPath = path.join(config.stateDir, 'github-installations.json');

  beforeEach(() => {
    clearMem();
  });

  test('returns { connected: false } when no installation', () => {
    expect(githubAuth.getStatus('unknown@c.us')).toEqual({ connected: false });
  });

  test('returns connected status with account when installation exists', () => {
    const waId = '5551234567@c.us';
    memFiles[installPath] = JSON.stringify({
      [waId]: {
        installationId: 789,
        account: 'octocat',
        connectedAt: '2026-01-01T00:00:00.000Z',
      },
    });
    const status = githubAuth.getStatus(waId);
    expect(status.connected).toBe(true);
    expect(status.account).toBe('octocat');
    expect(status.installationId).toBe(789);
    expect(status.connectedAt).toBe('2026-01-01T00:00:00.000Z');
  });
});

// ── getInstallUrl ─────────────────────────────────────────────────────────────

describe('getInstallUrl', () => {
  test('returns a GitHub App installation URL', () => {
    if (!githubAuth.isConfigured()) return;
    const url = githubAuth.getInstallUrl('1234567890@c.us');
    expect(url).toContain('github.com/apps/');
    expect(url).toContain(config.githubAppSlug);
    expect(url).toContain('installations/new');
    expect(url).toContain('state=');
  });
});

// ── State encryption/decryption ──────────────────────────────────────────────

describe('state encryption', () => {
  test('encrypts and decrypts state roundtrip', () => {
    const waId = '9876543210@c.us';
    const state = githubAuth.encryptState(waId);
    expect(typeof state).toBe('string');
    expect(state).toContain(':');

    const payload = githubAuth.decryptState(state);
    expect(payload).not.toBeNull();
    expect(payload.waId).toBe(waId);
    expect(payload.ts).toBeLessThanOrEqual(Date.now());
  });

  test('decryptState returns null for invalid state', () => {
    expect(githubAuth.decryptState('garbage')).toBeNull();
  });

  test('decryptState returns null for empty string', () => {
    expect(githubAuth.decryptState('')).toBeNull();
  });

  test('different users produce different encrypted states', () => {
    const s1 = githubAuth.encryptState('user1@c.us');
    const s2 = githubAuth.encryptState('user2@c.us');
    expect(s1).not.toBe(s2);
  });
});

// ── Functions require auth ───────────────────────────────────────────────────

describe('functions require GitHub auth', () => {
  beforeEach(() => {
    clearMem();
  });

  test('generateInstallationToken throws when not connected', async () => {
    await expect(githubAuth.generateInstallationToken('nobody@c.us'))
      .rejects.toThrow(/not connected/i);
  });

  test('listRepos throws when not connected', async () => {
    await expect(githubAuth.listRepos('nobody@c.us'))
      .rejects.toThrow(/not connected/i);
  });

  test('getCloneUrl throws when not connected', async () => {
    await expect(githubAuth.getCloneUrl('nobody@c.us', 'owner/repo'))
      .rejects.toThrow(/not connected/i);
  });
});

// ── handleCallback ───────────────────────────────────────────────────────────

describe('handleCallback', () => {
  const installPath = path.join(config.stateDir, 'github-installations.json');

  beforeEach(() => {
    clearMem();
  });

  test('rejects with invalid state', async () => {
    await expect(githubAuth.handleCallback('code', 'bad-state', '123'))
      .rejects.toThrow(/invalid or expired/i);
  });

  test('handles successful callback with mocked fetch', async () => {
    if (!githubAuth.isConfigured()) return;

    const waId = '1112223333@c.us';
    const state = githubAuth.encryptState(waId);

    const originalFetch = global.fetch;
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        json: async () => ({ access_token: 'ghu_test123' }),
      })
      .mockResolvedValueOnce({
        json: async () => ({ login: 'testuser', id: 42 }),
      });

    try {
      const result = await githubAuth.handleCallback('test-code', state, '999');

      expect(result.waId).toBe(waId);
      expect(result.account).toBe('testuser');

      // Verify installation was saved
      const install = githubAuth.getInstallation(waId);
      expect(install).not.toBeNull();
      expect(install.installationId).toBe(999);
      expect(install.account).toBe('testuser');
      expect(install.accountId).toBe(42);

      // Verify fetch was called correctly
      expect(global.fetch).toHaveBeenCalledTimes(2);
      // First call: token exchange
      expect(global.fetch.mock.calls[0][0]).toBe('https://github.com/login/oauth/access_token');
      // Second call: get user info
      expect(global.fetch.mock.calls[1][0]).toBe('https://api.github.com/user');
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('throws on GitHub OAuth error response', async () => {
    if (!githubAuth.isConfigured()) return;

    const waId = '4445556666@c.us';
    const state = githubAuth.encryptState(waId);

    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValueOnce({
      json: async () => ({ error: 'bad_verification_code', error_description: 'The code has expired' }),
    });

    try {
      await expect(githubAuth.handleCallback('bad-code', state, '999'))
        .rejects.toThrow(/expired/i);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

// ── generateInstallationToken ────────────────────────────────────────────────

describe('generateInstallationToken', () => {
  const installPath = path.join(config.stateDir, 'github-installations.json');
  const waId = '7778889999@c.us';

  beforeEach(() => {
    clearMem();
    memFiles[installPath] = JSON.stringify({
      [waId]: { installationId: 555, account: 'octocat' },
    });
  });

  test('generates token with mocked fetch', async () => {
    if (!githubAuth.isConfigured()) return;

    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        token: 'ghs_mocktoken123',
        expires_at: '2026-03-16T00:00:00Z',
      }),
    });

    try {
      const result = await githubAuth.generateInstallationToken(waId);
      expect(result.token).toBe('ghs_mocktoken123');
      expect(result.expiresAt).toBe('2026-03-16T00:00:00Z');

      // Verify JWT was sent in Authorization header
      const authHeader = global.fetch.mock.calls[0][1].headers.Authorization;
      expect(authHeader).toMatch(/^Bearer .+/);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('throws on API error', async () => {
    if (!githubAuth.isConfigured()) return;

    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      statusText: 'Not Found',
      json: async () => ({ message: 'Not Found' }),
    });

    try {
      await expect(githubAuth.generateInstallationToken(waId))
        .rejects.toThrow(/failed to generate/i);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

// ── listRepos ────────────────────────────────────────────────────────────────

describe('listRepos', () => {
  const installPath = path.join(config.stateDir, 'github-installations.json');
  const waId = '1231231234@c.us';

  beforeEach(() => {
    clearMem();
    memFiles[installPath] = JSON.stringify({
      [waId]: { installationId: 100, account: 'dev' },
    });
  });

  test('returns formatted repo list with mocked fetch', async () => {
    if (!githubAuth.isConfigured()) return;

    const originalFetch = global.fetch;
    global.fetch = jest.fn()
      // First call: generateInstallationToken
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'ghs_test', expires_at: '2026-03-16T00:00:00Z' }),
      })
      // Second call: list repos
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          repositories: [
            {
              full_name: 'dev/my-app',
              name: 'my-app',
              private: false,
              default_branch: 'main',
              clone_url: 'https://github.com/dev/my-app.git',
              html_url: 'https://github.com/dev/my-app',
            },
            {
              full_name: 'dev/secret-proj',
              name: 'secret-proj',
              private: true,
              default_branch: 'master',
              clone_url: 'https://github.com/dev/secret-proj.git',
              html_url: 'https://github.com/dev/secret-proj',
            },
          ],
        }),
      });

    try {
      const repos = await githubAuth.listRepos(waId);
      expect(repos).toHaveLength(2);
      expect(repos[0].fullName).toBe('dev/my-app');
      expect(repos[0].private).toBe(false);
      expect(repos[1].fullName).toBe('dev/secret-proj');
      expect(repos[1].private).toBe(true);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

// ── getCloneUrl ──────────────────────────────────────────────────────────────

describe('getCloneUrl', () => {
  const installPath = path.join(config.stateDir, 'github-installations.json');
  const waId = '9990001111@c.us';

  beforeEach(() => {
    clearMem();
    memFiles[installPath] = JSON.stringify({
      [waId]: { installationId: 200, account: 'dev' },
    });
  });

  test('returns authenticated clone URL', async () => {
    if (!githubAuth.isConfigured()) return;

    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token: 'ghs_clonetoken', expires_at: '2026-03-16T00:00:00Z' }),
    });

    try {
      const url = await githubAuth.getCloneUrl(waId, 'dev/my-repo');
      expect(url).toBe('https://x-access-token:ghs_clonetoken@github.com/dev/my-repo.git');
    } finally {
      global.fetch = originalFetch;
    }
  });
});
