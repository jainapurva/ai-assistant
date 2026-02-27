/**
 * Tests for claude.js state management:
 * - isGroupChat
 * - setProjectDir / getProjectDir / clearProjectDir
 * - setChatModel / getChatModel / clearChatModel
 * - clearSession
 * - task history
 * - getTokenUsage / resetTokenUsage
 *
 * Strategy: intercept fs methods for the state file path,
 * fall back to real fs for everything else so Node.js module loading works.
 */

const realFs = require('fs');
const path = require('path');

// claude.js computes STATE_FILE as path.join(config.stateDir, 'bot_state.json')
// config.stateDir defaults to path.join(__dirname, '..') which resolves to the project root
const STATE_PATH_SUFFIX = 'bot_state.json';

// In-memory store for mocked files
const memFiles = {};
// Fake directories (existsSync returns true for these)
const fakeDirs = new Set();

function isMockedPath(p) {
  return p.endsWith(STATE_PATH_SUFFIX);
}

// ── Save originals BEFORE setting up spies to avoid infinite recursion ──
const _origExistsSync = realFs.existsSync;
const _origReadFileSync = realFs.readFileSync;
const _origWriteFileSync = realFs.writeFileSync;
const _origStatSync = realFs.statSync;
const _origMkdirSync = realFs.mkdirSync;

// ── Spies ─────────────────────────────────────────────────────────────────────
jest.spyOn(realFs, 'existsSync').mockImplementation((p) => {
  if (isMockedPath(p)) return Object.prototype.hasOwnProperty.call(memFiles, p);
  if (fakeDirs.has(p)) return true;
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

jest.spyOn(realFs, 'statSync').mockImplementation((p) => {
  return _origStatSync.call(realFs, p);
});

jest.spyOn(realFs, 'mkdirSync').mockImplementation((p, opts) => {
  if (p && (p.includes('media_tmp') || isMockedPath(p))) return;
  _origMkdirSync.call(realFs, p, opts);
});

// Now require claude.js — loadState() will see no state files and skip gracefully
const claude = require('../../src/claude');

const {
  isGroupChat,
  setProjectDir, getProjectDir, clearProjectDir,
  setChatModel, getChatModel, clearChatModel,
  clearSession,
  getTaskHistory,
  getTokenUsage, resetTokenUsage,
  STATE_FILE,
} = claude;

// Helper: reset in-memory state between tests
function clearMem() {
  Object.keys(memFiles).forEach(k => delete memFiles[k]);
  fakeDirs.clear();
}

// ── isGroupChat ───────────────────────────────────────────────────────────────
describe('isGroupChat', () => {
  test('returns true for @g.us IDs', () => {
    expect(isGroupChat('123456789@g.us')).toBe(true);
  });

  test('returns false for @c.us IDs', () => {
    expect(isGroupChat('91XXXXXXXXXX@c.us')).toBe(false);
  });

  test('returns falsy for null', () => {
    expect(isGroupChat(null)).toBeFalsy();
  });

  test('returns falsy for undefined', () => {
    expect(isGroupChat(undefined)).toBeFalsy();
  });

  test('returns falsy for empty string', () => {
    expect(isGroupChat('')).toBeFalsy();
  });
});

// ── DM project directories ────────────────────────────────────────────────────
describe('setProjectDir / getProjectDir / clearProjectDir (DM)', () => {
  const chatId = '91XXXXXXXXXX@c.us';

  beforeEach(() => {
    clearMem();
    memFiles[STATE_FILE] = JSON.stringify({});
  });

  test('set and get project dir for DM chat', () => {
    const dir = '/tmp/myproject';
    fakeDirs.add(dir);
    setProjectDir(chatId, dir);
    expect(getProjectDir(chatId)).toBe(dir);
  });

  test('throws if directory does not exist', () => {
    expect(() => setProjectDir(chatId, '/nonexistent/path')).toThrow('does not exist');
  });

  test('clear removes project dir', () => {
    const dir = '/tmp/proj2';
    fakeDirs.add(dir);
    setProjectDir(chatId, dir);
    clearProjectDir(chatId);
    expect(getProjectDir(chatId)).toBeNull();
  });
});

// ── Group project directories (now use local state) ───────────────────────────
describe('setProjectDir / getProjectDir / clearProjectDir (group)', () => {
  const chatId = '123456789@g.us';

  beforeEach(() => {
    clearMem();
    memFiles[STATE_FILE] = JSON.stringify({});
  });

  test('set and get project dir for group chat via local state', () => {
    const dir = '/tmp/groupproj';
    fakeDirs.add(dir);
    setProjectDir(chatId, dir);
    expect(getProjectDir(chatId)).toBe(dir);
  });

  test('clear removes group project dir from local state', () => {
    const dir = '/tmp/groupproj2';
    fakeDirs.add(dir);
    setProjectDir(chatId, dir);
    clearProjectDir(chatId);
    expect(getProjectDir(chatId)).toBeNull();
  });

  test('returns null for group with no project set', () => {
    expect(getProjectDir(chatId)).toBeNull();
  });
});

// ── DM chat models ────────────────────────────────────────────────────────────
describe('setChatModel / getChatModel / clearChatModel (DM)', () => {
  const chatId = '91XXXXXXXXXX@c.us';

  beforeEach(() => {
    clearMem();
    memFiles[STATE_FILE] = JSON.stringify({});
  });

  test('set and get model for DM', () => {
    setChatModel(chatId, 'claude-haiku-4-5-20251001');
    expect(getChatModel(chatId)).toBe('claude-haiku-4-5-20251001');
  });

  test('clear removes model for DM', () => {
    setChatModel(chatId, 'claude-sonnet-4-6');
    clearChatModel(chatId);
    expect(getChatModel(chatId)).toBeNull();
  });
});

// ── Group chat models ─────────────────────────────────────────────────────────
describe('setChatModel / getChatModel / clearChatModel (group)', () => {
  const chatId = '999888777@g.us';

  beforeEach(() => {
    clearMem();
    memFiles[STATE_FILE] = JSON.stringify({});
  });

  test('set and get model for group via local state', () => {
    setChatModel(chatId, 'claude-opus-4-6');
    expect(getChatModel(chatId)).toBe('claude-opus-4-6');
  });

  test('clear removes model for group', () => {
    setChatModel(chatId, 'claude-opus-4-6');
    clearChatModel(chatId);
    expect(getChatModel(chatId)).toBeNull();
  });
});

// ── clearSession ──────────────────────────────────────────────────────────────
describe('clearSession', () => {
  beforeEach(() => {
    clearMem();
    memFiles[STATE_FILE] = JSON.stringify({});
  });

  test('clearing DM session does not throw', () => {
    expect(() => clearSession('91XXXXXXXXXX@c.us')).not.toThrow();
  });

  test('clearing group session does not throw', () => {
    expect(() => clearSession('777666555@g.us')).not.toThrow();
  });
});

// ── Task history ──────────────────────────────────────────────────────────────
describe('getTaskHistory', () => {
  test('returns empty array for unknown chat', () => {
    expect(getTaskHistory('unknown@c.us')).toEqual([]);
  });
});

// ── Token usage ───────────────────────────────────────────────────────────────
describe('getTokenUsage / resetTokenUsage', () => {
  const chatId = '91XXXXXXXXXX@c.us';

  beforeEach(() => {
    clearMem();
    memFiles[STATE_FILE] = JSON.stringify({});
  });

  test('returns zero usage for unknown chat', () => {
    expect(getTokenUsage(chatId)).toEqual({ input: 0, output: 0, tasks: 0 });
  });

  test('resetTokenUsage does not throw for unknown chat', () => {
    expect(() => resetTokenUsage(chatId)).not.toThrow();
  });

  test('getTokenUsage works for group chats too', () => {
    const groupId = '123456789@g.us';
    expect(getTokenUsage(groupId)).toEqual({ input: 0, output: 0, tasks: 0 });
  });
});
