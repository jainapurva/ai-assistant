/**
 * Tests for the premium ("highest plan" / Pro) behavior in claude.js:
 *   - isPremiumChat() membership (bare + @c.us forms)
 *   - non-premium tasks abort with TIMED_OUT when they exceed commandTimeoutMs
 *   - premium tasks have NO timeout and receive periodic onStatus updates
 *   - a user-initiated stop is reported as STOPPED_BY_USER (not TIMED_OUT)
 */

// ── Abort-aware mock SDK query ──────────────────────────────────────────────
// Yields an init message, then "works" for `ms` unless the abort signal fires,
// in which case it rejects with an AbortError (mirroring the real SDK).
function delayedQuery(ms, signal) {
  return {
    async *[Symbol.asyncIterator]() {
      yield { type: 'system', subtype: 'init', session_id: 's' };
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, ms);
        if (signal) {
          signal.addEventListener('abort', () => {
            clearTimeout(t);
            const e = new Error('aborted');
            e.name = 'AbortError';
            reject(e);
          });
        }
      });
      yield { type: 'result', result: 'done', session_id: 's', usage: { input_tokens: 1, output_tokens: 1 } };
    },
  };
}

let workMs = 50;
const mockSDK = {
  query: jest.fn(({ options }) => delayedQuery(workMs, options.abortController.signal)),
};

// ── Mocks (mirrors claude-mcp-spawn.test.js) ────────────────────────────────
jest.mock('../../src/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../../src/sandbox', () => ({
  isBwrapAvailable: jest.fn(() => false),
  ensureSandboxDirs: jest.fn(() => ({ base: '/tmp/test-sandbox', workspace: '/tmp/test-sandbox/workspace', claudeDir: '/tmp/test-sandbox/.claude' })),
  getSandboxDir: jest.fn(() => '/tmp/test-sandbox'),
}));
jest.mock('../../src/google-auth', () => ({ isConfigured: jest.fn(() => false), getStatus: jest.fn(() => ({ connected: false })) }));
jest.mock('../../src/microsoft-auth', () => ({ isConfigured: jest.fn(() => false), getStatus: jest.fn(() => ({ connected: false })) }));
jest.mock('../../src/resend-auth', () => ({ resolveApiKey: jest.fn(() => null) }));
jest.mock('../../src/github-auth', () => ({ isConfigured: jest.fn(() => false), getStatus: jest.fn(() => ({ connected: false })) }));
jest.mock('../../src/freetools-auth', () => ({ getStatus: jest.fn(() => { throw new Error('not configured'); }) }));
jest.mock('../../src/activity-logger', () => ({ logTaskStart: jest.fn(), logTaskEnd: jest.fn(), logSession: jest.fn(), syncToDb: jest.fn() }));
jest.mock('../../src/agents', () => ({
  getDefaultAgentId: jest.fn(() => 'general'),
  getAgent: jest.fn(() => ({ id: 'general', name: 'General', claudeMd: '' })),
  ensureAgentWorkspace: jest.fn((base, agentId) => `${base}/agents/${agentId}`),
}));
jest.mock('../../src/security', () => ({
  buildSafeEnv: () => ({ PATH: '/usr/bin' }),
  filterSensitiveOutput: (text) => ({ text, redacted: false, labels: [] }),
  sanitizePaths: (text) => text,
  SECURITY_SYSTEM_PROMPT: 'SECURITY_PROMPT',
}));
jest.mock('../../src/conversation-logger', () => ({
  logEntry: jest.fn(), loadHistory: jest.fn(() => []), formatHistoryAsContext: jest.fn(() => ''), clearHistory: jest.fn(),
}));
jest.mock('child_process', () => ({ execFileSync: jest.fn(() => 'mock-version') }));
jest.mock('fs', () => {
  const realFs = jest.requireActual('fs');
  return { ...realFs, existsSync: jest.fn((p) => (String(p).includes('bot_state') ? false : realFs.existsSync(p))), writeFileSync: jest.fn(), mkdirSync: jest.fn(), renameSync: jest.fn() };
});

jest.mock('../../src/config', () => ({
  claudePath: '/usr/local/bin/claude',
  claudeModel: 'claude-sonnet-4-6',
  enableSessions: false,
  sandboxEnabled: true,
  httpPort: 5153,
  commandTimeoutMs: 600000,
  premiumChats: ['14243937267@c.us'],
  premiumStatusIntervalMs: 40,
  premiumPlanName: 'Pro',
  premiumUpgradeUrl: 'https://swayat.com/#pricing',
  stateDir: '/tmp',
  nodeBinaryPath: '/usr/local/bin/node',
  mcpServerPath: '/opt/mcp/google-mcp-server.js',
  outlookMcpServerPath: '/opt/mcp/outlook-mcp-server.js',
  resendMcpPath: '/opt/mcp/resend-mcp-server.mjs',
  githubAppId: '', githubPrivateKeyPath: '', githubClientId: '', githubClientSecret: '',
}));

const config = require('../../src/config');
const { runClaude, stopClaude, isPremiumChat, _setSDKForTesting } = require('../../src/claude');

beforeEach(() => {
  workMs = 50;
  config.commandTimeoutMs = 600000;
  config.premiumChats = ['14243937267@c.us'];
  mockSDK.query.mockClear();
  mockSDK.query.mockImplementation(({ options }) => delayedQuery(workMs, options.abortController.signal));
  _setSDKForTesting(mockSDK);
});

describe('isPremiumChat', () => {
  test('matches a listed @c.us id', () => {
    expect(isPremiumChat('14243937267@c.us')).toBe(true);
  });
  test('matches the bare form too', () => {
    expect(isPremiumChat('14243937267')).toBe(true);
  });
  test('matches when the config entry is bare', () => {
    config.premiumChats = ['14243937267'];
    expect(isPremiumChat('14243937267@c.us')).toBe(true);
  });
  test('rejects a non-listed chat', () => {
    expect(isPremiumChat('16262300167@c.us')).toBe(false);
  });
  test('handles empty/undefined safely', () => {
    expect(isPremiumChat('')).toBe(false);
    expect(isPremiumChat(undefined)).toBe(false);
  });
});

describe('timeout behavior', () => {
  test('non-premium task that exceeds the timeout throws TIMED_OUT', async () => {
    config.commandTimeoutMs = 50;  // fire fast
    workMs = 1000;                 // work outlasts the timeout
    await expect(runClaude('long task', '16262300167@c.us', '16262300167@c.us'))
      .rejects.toThrow('TIMED_OUT');
  });

  test('premium task has no timeout and completes a long task', async () => {
    config.commandTimeoutMs = 50;  // would fire fast for non-premium
    workMs = 200;                  // outlasts that, but premium has no timer
    const onStatus = jest.fn();
    const result = await runClaude('long task', '14243937267@c.us', '14243937267@c.us', false, { onStatus });
    expect(result).toContain('done');
    // status pings (~every 40ms over ~200ms) should have fired at least once
    expect(onStatus).toHaveBeenCalled();
    expect(onStatus.mock.calls[0][0]).toMatch(/Still working/i);
  });

  test('a user stop is reported as STOPPED_BY_USER, not TIMED_OUT', async () => {
    config.commandTimeoutMs = 600000; // no timeout in play
    config.premiumChats = [];         // ensure a finite (but far) timeout path is irrelevant
    workMs = 1000;
    const chat = '16262300167@c.us';
    const p = runClaude('stoppable', chat, chat);
    // Let the query register, then stop it like /stop would.
    await new Promise(r => setTimeout(r, 30));
    stopClaude(chat);
    await expect(p).rejects.toThrow('STOPPED_BY_USER');
  });
});
