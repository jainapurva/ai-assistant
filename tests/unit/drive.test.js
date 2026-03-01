/**
 * Tests for drive.js:
 * - isConfigured delegates to google-auth
 * - uploadFile and listFiles require waId (per-user OAuth)
 * - Returns error string when user not connected
 */

// Mock google-auth module
jest.mock('../../src/google-auth', () => ({
  isConfigured: jest.fn(),
  createAuthenticatedClient: jest.fn(),
}));

// Mock googleapis to prevent real API calls
jest.mock('googleapis', () => ({
  google: {
    drive: jest.fn(() => ({
      files: {
        list: jest.fn(),
        create: jest.fn(),
      },
      permissions: {
        create: jest.fn(),
      },
    })),
  },
}));

const drive = require('../../src/drive');
const googleAuth = require('../../src/google-auth');

beforeEach(() => {
  jest.clearAllMocks();
});

// ── isConfigured ──────────────────────────────────────────────────────────────

describe('isConfigured', () => {
  test('delegates to googleAuth.isConfigured', () => {
    googleAuth.isConfigured.mockReturnValue(true);
    expect(drive.isConfigured()).toBe(true);
    expect(googleAuth.isConfigured).toHaveBeenCalled();
  });

  test('returns false when googleAuth is not configured', () => {
    googleAuth.isConfigured.mockReturnValue(false);
    expect(drive.isConfigured()).toBe(false);
  });
});

// ── uploadFile ────────────────────────────────────────────────────────────────

describe('uploadFile', () => {
  test('returns error string when not configured', async () => {
    googleAuth.isConfigured.mockReturnValue(false);
    const result = await drive.uploadFile('user@c.us', 'group@g.us', 'Group', '/tmp/file.txt');
    expect(result).toContain('not configured');
  });

  test('returns error string when user not connected (no OAuth)', async () => {
    googleAuth.isConfigured.mockReturnValue(true);
    googleAuth.createAuthenticatedClient.mockReturnValue(null);
    const result = await drive.uploadFile('user@c.us', 'group@g.us', 'Group', '/tmp/file.txt');
    expect(result).toContain('not connected');
  });

  test('accepts waId as first parameter', async () => {
    googleAuth.isConfigured.mockReturnValue(true);
    googleAuth.createAuthenticatedClient.mockReturnValue(null);
    // The key assertion: uploadFile takes (waId, groupId, groupName, filePath)
    await drive.uploadFile('user@c.us', 'group@g.us', 'Group', '/tmp/file.txt');
    expect(googleAuth.createAuthenticatedClient).toHaveBeenCalledWith('user@c.us');
  });
});

// ── listFiles ─────────────────────────────────────────────────────────────────

describe('listFiles', () => {
  test('returns error string when not configured', async () => {
    googleAuth.isConfigured.mockReturnValue(false);
    const result = await drive.listFiles('user@c.us', 'group@g.us');
    expect(result).toContain('not configured');
  });

  test('returns error string when user not connected', async () => {
    googleAuth.isConfigured.mockReturnValue(true);
    googleAuth.createAuthenticatedClient.mockReturnValue(null);
    const result = await drive.listFiles('user@c.us', 'group@g.us');
    expect(result).toContain('not connected');
  });

  test('accepts waId as first parameter', async () => {
    googleAuth.isConfigured.mockReturnValue(true);
    googleAuth.createAuthenticatedClient.mockReturnValue(null);
    await drive.listFiles('user@c.us', 'group@g.us');
    expect(googleAuth.createAuthenticatedClient).toHaveBeenCalledWith('user@c.us');
  });
});

// ── Exports ───────────────────────────────────────────────────────────────────

describe('drive exports', () => {
  test('exports uploadFile, listFiles, isConfigured', () => {
    expect(typeof drive.uploadFile).toBe('function');
    expect(typeof drive.listFiles).toBe('function');
    expect(typeof drive.isConfigured).toBe('function');
  });

  test('uploadFile takes 4 arguments (waId, groupId, groupName, filePath)', () => {
    expect(drive.uploadFile.length).toBe(4);
  });

  test('listFiles takes 2 arguments (waId, groupId)', () => {
    expect(drive.listFiles.length).toBe(2);
  });
});
