/**
 * Tests for claude.js state management:
 * - isGroupChat
 * - loadSharedState / saveSharedState / withSharedStateLock
 * - setProjectDir / getProjectDir / clearProjectDir (DM + group)
 * - setChatModel / getChatModel / clearChatModel (DM + group)
 * - acquireGroupLock / releaseGroupLock
 * - claimGroupMessage (dedup)
 * - clearSession
 * - task history
 *
 * Strategy: intercept fs methods for specific controlled paths (state files, lock),
 * fall back to real fs for everything else so Node.js module loading works.
 *
 * IMPORTANT: capture original fs functions BEFORE jest.spyOn so that fallthrough
 * calls use the real implementation without infinite recursion.
 */

const realFs = require('fs');

// ── Paths we intercept ─────────────────────────────────────────────────────────
// claude.js computes SHARED_STATE_FILE as path.join(config.stateDir, '.bot-shared-state.json')
// config.stateDir defaults to path.join(__dirname, '..') which resolves to the project root
const path = require('path');
const SHARED_STATE_PATH = path.resolve(__dirname, '..', '..', '.bot-shared-state.json');
const LOCK_PATH = SHARED_STATE_PATH + '.lock';
// claude.js computes STATE_FILE as path.join(config.stateDir, `bot_state_${instanceId}.json`)
// INSTANCE_ID=test (from setup.js) so it ends with bot_state_test.json
const STATE_PATH_SUFFIX = 'bot_state_test.json';

// In-memory store for mocked files
const memFiles = {};
// Fake directories (existsSync returns true for these)
const fakeDirs = new Set();

function isMockedPath(p) {
  return p === SHARED_STATE_PATH || p.endsWith(STATE_PATH_SUFFIX);
}

// ── CRITICAL: save originals BEFORE setting up spies to avoid infinite recursion ──
const _origExistsSync = realFs.existsSync;
const _origReadFileSync = realFs.readFileSync;
const _origWriteFileSync = realFs.writeFileSync;
const _origOpenSync = realFs.openSync;
const _origCloseSync = realFs.closeSync;
const _origUnlinkSync = realFs.unlinkSync;
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

jest.spyOn(realFs, 'openSync').mockImplementation((p, flags) => {
  if (p === LOCK_PATH) {
    if (flags === 'wx') {
      if (Object.prototype.hasOwnProperty.call(memFiles, p)) {
        throw Object.assign(new Error(`EEXIST: ${p}`), { code: 'EEXIST' });
      }
      memFiles[p] = '';
      return 999; // fake fd
    }
  }
  return _origOpenSync.call(realFs, p, flags);
});

jest.spyOn(realFs, 'closeSync').mockImplementation((fd) => {
  if (fd === 999) return;
  _origCloseSync.call(realFs, fd);
});

jest.spyOn(realFs, 'unlinkSync').mockImplementation((p) => {
  if (p === LOCK_PATH || isMockedPath(p)) {
    delete memFiles[p];
    return;
  }
  _origUnlinkSync.call(realFs, p);
});

jest.spyOn(realFs, 'statSync').mockImplementation((p) => {
  if (p === LOCK_PATH) {
    if (!Object.prototype.hasOwnProperty.call(memFiles, p)) {
      throw Object.assign(new Error(`ENOENT: ${p}`), { code: 'ENOENT' });
    }
    return { mtimeMs: Date.now() };
  }
  return _origStatSync.call(realFs, p);
});

jest.spyOn(realFs, 'mkdirSync').mockImplementation((p, opts) => {
  // Only intercept media_tmp dir creation (from index.js), ignore for tests
  if (p && (p.includes('media_tmp') || isMockedPath(p))) return;
  _origMkdirSync.call(realFs, p, opts);
});

// Now require claude.js — loadState() will see no state files and skip gracefully
const claude = require('../../src/claude');

const {
  isGroupChat,
  loadSharedState, saveSharedState, withSharedStateLock,
  setProjectDir, getProjectDir, clearProjectDir,
  setChatModel, getChatModel, clearChatModel,
  acquireGroupLock, releaseGroupLock,
  claimGroupMessage,
  clearSession,
  getTaskHistory,
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

// ── loadSharedState / saveSharedState ─────────────────────────────────────────
describe('loadSharedState / saveSharedState', () => {
  beforeEach(clearMem);

  test('returns default state when file does not exist', () => {
    const state = loadSharedState();
    expect(state).toEqual({ sessions: {}, projectDirs: {} });
  });

  test('round-trips data correctly', () => {
    const data = { sessions: { 'abc@g.us': 'sess123' }, projectDirs: { 'abc@g.us': '/tmp/proj' } };
    saveSharedState(data);
    const loaded = loadSharedState();
    expect(loaded).toEqual(data);
  });

  test('handles corrupt JSON gracefully', () => {
    memFiles[SHARED_STATE_PATH] = 'NOT JSON {{{';
    const state = loadSharedState();
    expect(state).toEqual({ sessions: {}, projectDirs: {} });
  });
});

// ── withSharedStateLock ───────────────────────────────────────────────────────
describe('withSharedStateLock', () => {
  beforeEach(clearMem);

  test('executes function and returns its result', () => {
    const result = withSharedStateLock(() => 42);
    expect(result).toBe(42);
  });

  test('releases lock even if function throws', () => {
    expect(() => withSharedStateLock(() => { throw new Error('boom'); })).toThrow('boom');
    expect(memFiles[LOCK_PATH]).toBeUndefined();
  });

  test('sequential lock acquisitions succeed after previous release', () => {
    let count = 0;
    withSharedStateLock(() => { count++; });
    withSharedStateLock(() => { count++; });
    expect(count).toBe(2);
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

// ── Group project directories (shared state) ──────────────────────────────────
describe('setProjectDir / getProjectDir / clearProjectDir (group)', () => {
  const chatId = '123456789@g.us';

  beforeEach(clearMem);

  test('set and get project dir for group chat via shared state', () => {
    const dir = '/tmp/groupproj';
    fakeDirs.add(dir);
    setProjectDir(chatId, dir);
    expect(getProjectDir(chatId)).toBe(dir);
  });

  test('clear removes group project dir from shared state', () => {
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

  beforeEach(clearMem);

  test('set and get model for group via shared state', () => {
    setChatModel(chatId, 'claude-opus-4-6');
    expect(getChatModel(chatId)).toBe('claude-opus-4-6');
  });

  test('clear removes model for group', () => {
    setChatModel(chatId, 'claude-opus-4-6');
    clearChatModel(chatId);
    expect(getChatModel(chatId)).toBeNull();
  });
});

// ── Group distributed lock ────────────────────────────────────────────────────
describe('acquireGroupLock / releaseGroupLock', () => {
  const chatId = '555444333@g.us';

  beforeEach(clearMem);

  test('first acquire succeeds', () => {
    expect(acquireGroupLock(chatId)).toBe(true);
  });

  test('second acquire fails when lock held', () => {
    acquireGroupLock(chatId);
    expect(acquireGroupLock(chatId)).toBe(false);
  });

  test('acquire succeeds after release', () => {
    acquireGroupLock(chatId);
    releaseGroupLock(chatId);
    expect(acquireGroupLock(chatId)).toBe(true);
  });

  test('different chat IDs have independent locks', () => {
    const chatId2 = '111222333@g.us';
    acquireGroupLock(chatId);
    expect(acquireGroupLock(chatId2)).toBe(true);
  });
});

// ── Message deduplication ─────────────────────────────────────────────────────
describe('claimGroupMessage', () => {
  beforeEach(clearMem);

  test('first claim returns true', () => {
    expect(claimGroupMessage('msg001')).toBe(true);
  });

  test('second claim for same message returns false', () => {
    claimGroupMessage('msg002');
    expect(claimGroupMessage('msg002')).toBe(false);
  });

  test('different message IDs are independent', () => {
    claimGroupMessage('msg003');
    expect(claimGroupMessage('msg004')).toBe(true);
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

  test('clearing group session removes from shared state', () => {
    const chatId = '777666555@g.us';
    memFiles[SHARED_STATE_PATH] = JSON.stringify({ sessions: { [chatId]: 'sess_abc' }, projectDirs: {} });
    clearSession(chatId);
    const state = loadSharedState();
    expect(state.sessions[chatId]).toBeUndefined();
  });
});

// ── Task history ──────────────────────────────────────────────────────────────
describe('getTaskHistory', () => {
  test('returns empty array for unknown chat', () => {
    expect(getTaskHistory('unknown@c.us')).toEqual([]);
  });
});
