/**
 * Regression test: claude.js saveState() must preserve top-level keys it
 * doesn't manage (e.g. scheduledTasks owned by scheduler.js). Earlier
 * implementations rebuilt the file from a fixed key list and silently
 * wiped scheduler/tasks state on every write.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const TEST_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bot_state_savestate_'));
process.env.BOT_STATE_DIR = TEST_STATE_DIR;

// Force a fresh require so the module reads our env-set state dir.
jest.isolateModules(() => {});

const claude = require('../../src/claude');

afterAll(() => {
  fs.rmSync(TEST_STATE_DIR, { recursive: true, force: true });
});

describe('claude.saveState preserves unknown top-level keys', () => {
  test('scheduledTasks survives a saveState() write', () => {
    // Seed the state file with a key that saveState() does NOT manage.
    const seeded = {
      scheduledTasks: [
        { id: 'sched_test', chatId: '15551234567', cron: '0 * * * *', prompt: 'hi', type: 'remind', oneShot: false, enabled: true },
      ],
      userTasks: [{ id: 'legacy_test' }],
    };
    fs.writeFileSync(claude.STATE_FILE, JSON.stringify(seeded));

    // Trigger saveState by mutating a managed Map/Set the only way the public
    // API exposes — `markGreeted` writes through saveState.
    claude.markGreeted('test-chat-id');

    const written = JSON.parse(fs.readFileSync(claude.STATE_FILE, 'utf8'));
    expect(written.scheduledTasks).toBeDefined();
    expect(written.scheduledTasks).toHaveLength(1);
    expect(written.scheduledTasks[0].id).toBe('sched_test');
    expect(written.userTasks).toBeDefined();
    expect(written.greetedChats).toContain('test-chat-id');
  });

  test('saveState handles a missing/corrupt file without throwing', () => {
    if (fs.existsSync(claude.STATE_FILE)) fs.unlinkSync(claude.STATE_FILE);
    expect(() => claude.saveState()).not.toThrow();
    fs.writeFileSync(claude.STATE_FILE, 'not json {{{');
    expect(() => claude.saveState()).not.toThrow();
    // After the corrupt-recovery write, the file should be valid JSON again.
    const written = JSON.parse(fs.readFileSync(claude.STATE_FILE, 'utf8'));
    expect(typeof written).toBe('object');
  });
});
