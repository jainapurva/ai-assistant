const fs = require('fs');
const path = require('path');
const os = require('os');

jest.mock('../../src/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../../src/config', () => ({
  claudeModel: 'claude-sonnet-4-6',
  heartbeatEnabled: true,
  heartbeatThresholdHours: 10,
  heartbeatCooldownHours: 24,
  heartbeatQuietStartHour: 23,
  heartbeatQuietEndHour: 8,
  heartbeatDefaultTz: 'America/Los_Angeles',
  heartbeatAllowedChats: [],
}));

jest.mock('../../src/claude', () => ({
  getAllChatIds: jest.fn(() => []),
  getAllHeartbeatChatIds: jest.fn(() => []),
  getHeartbeatState: jest.fn(),
  recordUserMessage: jest.fn(),
  recordHeartbeatSent: jest.fn(),
  getUserAgent: jest.fn(() => 'general'),
  getSandboxKey: jest.fn((id) => id),
  getProjectDir: jest.fn(() => null),
}));

jest.mock('../../src/conversation-logger', () => ({
  loadHistory: jest.fn(() => []),
}));

jest.mock('../../src/profiles', () => ({
  getProfile: jest.fn(() => null),
}));

jest.mock('../../src/agents', () => ({
  getDefaultAgentId: jest.fn(() => 'general'),
}));

jest.mock('../../src/chat-logger', () => {
  const path = require('path');
  const os = require('os');
  return { LOGS_DIR: path.join(os.tmpdir(), 'heartbeat-nonexistent-logs-' + Date.now()) };
});

const claude = require('../../src/claude');
const conversation = require('../../src/conversation-logger');
const profiles = require('../../src/profiles');
const config = require('../../src/config');
const runner = require('../../src/heartbeat-runner');
const { isQuietHour, currentHourInTz } = runner._internal;

// --- Mock the SDK (ESM import) ---
function makeMockSDK(replyText) {
  async function* gen() {
    yield {
      type: 'assistant',
      content: [{ type: 'text', text: replyText }],
    };
  }
  return {
    query: jest.fn(() => gen()),
  };
}

describe('heartbeat-runner: pure helpers', () => {
  describe('isQuietHour', () => {
    test('non-wrapping window [13, 17)', () => {
      expect(isQuietHour(12, 13, 17)).toBe(false);
      expect(isQuietHour(13, 13, 17)).toBe(true);
      expect(isQuietHour(16, 13, 17)).toBe(true);
      expect(isQuietHour(17, 13, 17)).toBe(false);
    });

    test('wrapping window [23, 8)', () => {
      expect(isQuietHour(22, 23, 8)).toBe(false);
      expect(isQuietHour(23, 23, 8)).toBe(true);
      expect(isQuietHour(0, 23, 8)).toBe(true);
      expect(isQuietHour(7, 23, 8)).toBe(true);
      expect(isQuietHour(8, 23, 8)).toBe(false);
      expect(isQuietHour(12, 23, 8)).toBe(false);
    });

    test('start == end returns false', () => {
      expect(isQuietHour(5, 8, 8)).toBe(false);
    });
  });

  describe('currentHourInTz', () => {
    test('returns integer in [0, 23]', () => {
      const hour = currentHourInTz(new Date(), 'America/Los_Angeles');
      expect(Number.isInteger(hour)).toBe(true);
      expect(hour).toBeGreaterThanOrEqual(0);
      expect(hour).toBeLessThanOrEqual(23);
    });

    test('known UTC timestamp in LA', () => {
      // 2026-04-20 T10:00:00 UTC == 03:00 in LA (PDT)
      const d = new Date('2026-04-20T10:00:00Z');
      expect(currentHourInTz(d, 'America/Los_Angeles')).toBe(3);
    });

    test('invalid tz falls back to UTC hour', () => {
      const d = new Date('2026-04-20T10:00:00Z');
      expect(currentHourInTz(d, 'Not/A_Zone')).toBe(10);
    });
  });
});

describe('heartbeat-runner: processUser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    runner.init(jest.fn(async () => {}));
    runner._internal._setSDKForTesting(makeMockSDK('SKIP'));
    // reset config defaults per test
    config.heartbeatEnabled = true;
    config.heartbeatAllowedChats = [];
    config.heartbeatThresholdHours = 10;
    config.heartbeatCooldownHours = 24;
    config.heartbeatQuietStartHour = 23;
    config.heartbeatQuietEndHour = 8;
  });

  test('skips when heartbeat globally disabled', async () => {
    config.heartbeatEnabled = false;
    const out = await runner.processUser('111@c.us');
    expect(out).toBe('skipped-disabled');
  });

  test('skips when chat not in allowlist', async () => {
    config.heartbeatAllowedChats = ['222@c.us'];
    const out = await runner.processUser('111@c.us');
    expect(out).toBe('skipped-disabled');
  });

  test('skips when state says disabled', async () => {
    claude.getHeartbeatState.mockReturnValue({
      lastUserMessageAt: 0,
      enabled: false,
    });
    const out = await runner.processUser('111@c.us');
    expect(out).toBe('skipped-disabled');
  });

  test('skips when no history to seed from', async () => {
    claude.getHeartbeatState.mockReturnValue(null);
    const out = await runner.processUser('111@c.us');
    expect(out).toBe('skipped-no-history');
  });

  test('skips when under idle threshold', async () => {
    const now = Date.now();
    claude.getHeartbeatState.mockReturnValue({
      lastUserMessageAt: now - 5 * 3600 * 1000, // 5h ago
      enabled: true,
    });
    const out = await runner.processUser('111@c.us', now);
    expect(out).toBe('skipped-threshold');
  });

  test('skips when within cooldown', async () => {
    const now = Date.now();
    claude.getHeartbeatState.mockReturnValue({
      lastUserMessageAt: now - 12 * 3600 * 1000,
      lastHeartbeatAt: now - 2 * 3600 * 1000, // pinged 2h ago
      enabled: true,
    });
    const out = await runner.processUser('111@c.us', now);
    expect(out).toBe('skipped-cooldown');
  });

  test('skips during quiet hours', async () => {
    // Pick a UTC time that maps into LA quiet window (3am LA == 10 UTC on PDT)
    const now = Date.parse('2026-04-20T10:00:00Z');
    claude.getHeartbeatState.mockReturnValue({
      lastUserMessageAt: now - 12 * 3600 * 1000,
      enabled: true,
    });
    conversation.loadHistory.mockReturnValue([{ role: 'user', content: 'hi', ts: '' }]);
    const out = await runner.processUser('111@c.us', now);
    expect(out).toBe('skipped-quiet');
  });

  test('skips when no conversation history', async () => {
    const now = Date.parse('2026-04-20T19:00:00Z'); // noon in LA — awake
    claude.getHeartbeatState.mockReturnValue({
      lastUserMessageAt: now - 12 * 3600 * 1000,
      enabled: true,
    });
    conversation.loadHistory.mockReturnValue([]);
    const out = await runner.processUser('111@c.us', now);
    expect(out).toBe('skipped-no-history');
  });

  test('skips when Claude returns SKIP', async () => {
    const now = Date.parse('2026-04-20T19:00:00Z');
    claude.getHeartbeatState.mockReturnValue({
      lastUserMessageAt: now - 12 * 3600 * 1000,
      enabled: true,
    });
    conversation.loadHistory.mockReturnValue([
      { role: 'user', content: 'thanks!', ts: '' },
    ]);
    runner._internal._setSDKForTesting(makeMockSDK('SKIP'));
    const out = await runner.processUser('111@c.us', now);
    expect(out).toBe('skipped-claude');
  });

  test('sends when Claude returns a message', async () => {
    const now = Date.parse('2026-04-20T19:00:00Z'); // awake hours in LA
    claude.getHeartbeatState.mockReturnValue({
      lastUserMessageAt: now - 12 * 3600 * 1000,
      enabled: true,
    });
    conversation.loadHistory.mockReturnValue([
      { role: 'user', content: 'draft me an invoice', ts: '' },
      { role: 'assistant', content: 'sure, what should I put on it?', ts: '' },
    ]);
    profiles.getProfile.mockReturnValue({ displayName: 'Dhruvil' });
    runner._internal._setSDKForTesting(makeMockSDK('Want me to go ahead and draft that invoice?'));

    const sendFn = jest.fn(async () => {});
    runner.init(sendFn);

    const out = await runner.processUser('111@c.us', now);
    expect(out).toBe('sent');
    expect(sendFn).toHaveBeenCalledWith(
      '111@c.us',
      expect.stringContaining('Want me to go ahead and draft that invoice?')
    );
    expect(sendFn.mock.calls[0][1]).toContain('*[Heartbeat]*');
    expect(claude.recordHeartbeatSent).toHaveBeenCalledWith('111@c.us', now);
  });

  test('treats SKIP variants case-insensitively', async () => {
    const now = Date.parse('2026-04-20T19:00:00Z');
    claude.getHeartbeatState.mockReturnValue({
      lastUserMessageAt: now - 12 * 3600 * 1000,
      enabled: true,
    });
    conversation.loadHistory.mockReturnValue([{ role: 'user', content: 'x', ts: '' }]);
    runner._internal._setSDKForTesting(makeMockSDK('skip'));
    const out = await runner.processUser('111@c.us', now);
    expect(out).toBe('skipped-claude');
  });

  test('strips code fences from Claude output', async () => {
    const now = Date.parse('2026-04-20T19:00:00Z');
    claude.getHeartbeatState.mockReturnValue({
      lastUserMessageAt: now - 12 * 3600 * 1000,
      enabled: true,
    });
    conversation.loadHistory.mockReturnValue([{ role: 'user', content: 'x', ts: '' }]);
    runner._internal._setSDKForTesting(makeMockSDK('```\nStill need help with the invoice?\n```'));
    const sendFn = jest.fn(async () => {});
    runner.init(sendFn);
    const out = await runner.processUser('111@c.us', now);
    expect(out).toBe('sent');
    expect(sendFn.mock.calls[0][1]).toContain('Still need help with the invoice?');
    expect(sendFn.mock.calls[0][1]).not.toContain('```');
  });
});

describe('heartbeat-runner: runHeartbeatCycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    config.heartbeatEnabled = true;
  });

  test('iterates all chat ids and aggregates outcomes', async () => {
    claude.getAllChatIds.mockReturnValue(['a@c.us', 'b@c.us']);
    claude.getAllHeartbeatChatIds.mockReturnValue(['b@c.us', 'c@c.us']);
    claude.getHeartbeatState.mockReturnValue(null); // all skipped-no-history
    runner.init(jest.fn(async () => {}));

    const result = await runner.runHeartbeatCycle();
    expect(result.considered).toBe(3);
    expect(result.sent).toBe(0);
    expect(result.outcomes['skipped-no-history']).toBe(3);
  });

  test('bails out early if no send function', async () => {
    runner.init(null);
    const result = await runner.runHeartbeatCycle();
    expect(result).toEqual({ sent: 0, considered: 0 });
  });
});

describe('heartbeat-runner: seedLastUserMessageFromLog', () => {
  const { seedLastUserMessageFromLog } = runner._internal;
  let tmpLogsDir;

  beforeAll(() => {
    tmpLogsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'heartbeat-logs-'));
    // Re-mock chat-logger to point at our temp dir
    jest.resetModules();
    jest.doMock('../../src/chat-logger', () => ({ LOGS_DIR: tmpLogsDir }));
  });

  afterAll(() => {
    fs.rmSync(tmpLogsDir, { recursive: true, force: true });
  });

  test('returns null when log file missing', () => {
    expect(seedLastUserMessageFromLog('99999@c.us')).toBeNull();
  });
});
