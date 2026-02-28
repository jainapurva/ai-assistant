const crypto = require('crypto');
const path = require('path');

// Mock child_process before requiring sandbox
jest.mock('child_process', () => ({
  execFileSync: jest.fn(),
  spawn: jest.fn(),
}));

// Mock fs for cleanWorkspace tests
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    realpathSync: jest.fn(() => '/usr/local/bin/claude'),
    mkdirSync: jest.fn(),
    existsSync: jest.fn(() => true),
    readdirSync: jest.fn(() => []),
    statSync: jest.fn(() => ({ isDirectory: () => false })),
    unlinkSync: jest.fn(),
    rmSync: jest.fn(),
    writeFileSync: jest.fn(),
  };
});

const { hashChatId, getContainerName, getSandboxDir, cleanWorkspace } = require('../../src/sandbox');
const config = require('../../src/config');
const fs = require('fs');

describe('hashChatId', () => {
  test('returns 12-char hex string', () => {
    const hash = hashChatId('1234567890@c.us');
    expect(hash).toMatch(/^[a-f0-9]{12}$/);
    expect(hash.length).toBe(12);
  });

  test('is deterministic — same input gives same output', () => {
    const a = hashChatId('1234567890@c.us');
    const b = hashChatId('1234567890@c.us');
    expect(a).toBe(b);
  });

  test('different inputs give different hashes', () => {
    const a = hashChatId('1111111111@c.us');
    const b = hashChatId('2222222222@c.us');
    expect(a).not.toBe(b);
  });

  test('matches Node crypto SHA-256 first 12 chars', () => {
    const chatId = '9876543210@c.us';
    const expected = crypto.createHash('sha256').update(chatId).digest('hex').slice(0, 12);
    expect(hashChatId(chatId)).toBe(expected);
  });
});

describe('getContainerName', () => {
  test('starts with ai-sandbox- prefix', () => {
    const name = getContainerName('1234567890@c.us');
    expect(name).toMatch(/^ai-sandbox-[a-f0-9]{12}$/);
  });

  test('is a valid Docker container name (no special chars)', () => {
    const name = getContainerName('1234567890@c.us');
    expect(name).toMatch(/^[a-z0-9-]+$/);
  });
});

describe('getSandboxDir', () => {
  test('uses config.sandboxBaseDir', () => {
    const dir = getSandboxDir('1234567890@c.us');
    expect(dir).toContain(config.sandboxBaseDir);
  });

  test('contains the hash', () => {
    const chatId = '1234567890@c.us';
    const hash = hashChatId(chatId);
    const dir = getSandboxDir(chatId);
    expect(dir).toBe(path.join(config.sandboxBaseDir, hash));
  });
});

describe('cleanWorkspace', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('preserves CLAUDE.md when cleaning', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockReturnValue(['CLAUDE.md', 'output.txt', 'data']);
    fs.statSync.mockImplementation((p) => ({
      isDirectory: () => p.endsWith('data'),
    }));

    const removed = cleanWorkspace('1234567890@c.us');

    expect(removed).toBe(2);
    // Should NOT have deleted CLAUDE.md
    expect(fs.unlinkSync).not.toHaveBeenCalledWith(
      expect.stringContaining('CLAUDE.md')
    );
    // Should have deleted output.txt
    expect(fs.unlinkSync).toHaveBeenCalledWith(
      expect.stringContaining('output.txt')
    );
    // Should have deleted data directory
    expect(fs.rmSync).toHaveBeenCalledWith(
      expect.stringContaining('data'),
      { recursive: true, force: true }
    );
  });

  test('returns 0 when workspace does not exist', () => {
    fs.existsSync.mockReturnValue(false);
    const removed = cleanWorkspace('1234567890@c.us');
    expect(removed).toBe(0);
  });

  test('returns 0 for empty workspace', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockReturnValue([]);
    const removed = cleanWorkspace('1234567890@c.us');
    expect(removed).toBe(0);
  });
});
