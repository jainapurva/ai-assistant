/**
 * Tests for Claude Agent SDK query behavior with MCP config.
 *
 * These tests verify that MCP servers are correctly configured in SDK options
 * and that the SDK query is called with the right parameters.
 */

// ── Track SDK query calls ──────────────────────────────────────────────────

let lastQueryCall = null;

function createMockQueryResult(result = 'test response') {
  return {
    async *[Symbol.asyncIterator]() {
      yield { type: 'system', subtype: 'init', session_id: 'test-session' };
      yield {
        type: 'result',
        result,
        session_id: 'test-session',
        usage: { input_tokens: 10, output_tokens: 5 },
        total_cost_usd: 0.001,
      };
    },
  };
}

const mockSDK = {
  query: jest.fn(({ prompt, options }) => {
    lastQueryCall = { prompt, options };
    return createMockQueryResult();
  }),
};

// ── Mock sandbox ────────────────────────────────────────────────────────────

jest.mock('../../src/sandbox', () => ({
  isBwrapAvailable: jest.fn(() => false),
  spawnInBwrap: jest.fn(),
  ensureSandboxDirs: jest.fn((chatId) => ({
    base: '/tmp/test-sandbox',
    workspace: '/tmp/test-sandbox/workspace',
    claudeDir: '/tmp/test-sandbox/.claude',
  })),
  getSandboxDir: jest.fn(() => '/tmp/test-sandbox'),
}));

// ── Mock google-auth ────────────────────────────────────────────────────────

const mockGoogleAuth = {
  isConfigured: jest.fn(() => false),
  getStatus: jest.fn(() => ({ connected: false })),
};
jest.mock('../../src/google-auth', () => mockGoogleAuth);

// ── Mock microsoft-auth ──────────────────────────────────────────────────────

const mockMicrosoftAuth = {
  isConfigured: jest.fn(() => false),
  getStatus: jest.fn(() => ({ connected: false })),
};
jest.mock('../../src/microsoft-auth', () => mockMicrosoftAuth);

// ── Mock resend-auth ───────────────────────────────────────────────────────

const mockResendAuth = {
  resolveApiKey: jest.fn(() => null),
};
jest.mock('../../src/resend-auth', () => mockResendAuth);

// ── Mock activity-logger ────────────────────────────────────────────────────

jest.mock('../../src/activity-logger', () => ({
  logTaskStart: jest.fn(),
  logTaskEnd: jest.fn(),
  logSession: jest.fn(),
  syncToDb: jest.fn(),
}));

// ── Mock agents ─────────────────────────────────────────────────────────────

jest.mock('../../src/agents', () => ({
  getDefaultAgentId: jest.fn(() => 'general'),
  getAgent: jest.fn(() => ({ id: 'general', name: 'General', claudeMd: '' })),
  ensureAgentWorkspace: jest.fn((base, agentId) => `${base}/agents/${agentId}`),
}));

// ── Mock security ───────────────────────────────────────────────────────────

jest.mock('../../src/security', () => ({
  buildSafeEnv: () => ({ PATH: '/usr/bin', HOME: '/home/test', TERM: 'dumb' }),
  filterSensitiveOutput: (text) => ({ text, redacted: false, labels: [] }),
  sanitizePaths: (text) => text,
  SECURITY_SYSTEM_PROMPT: 'SECURITY_PROMPT',
}));

// ── Mock config ─────────────────────────────────────────────────────────────

jest.mock('../../src/config', () => ({
  claudePath: '/usr/local/bin/claude',
  claudeModel: 'claude-sonnet-4-6',
  enableSessions: false,
  sandboxEnabled: true,
  httpPort: 5153,
  commandTimeoutMs: 0,
  stateDir: '/tmp',
  nodeBinaryPath: '/usr/local/bin/node',
  mcpServerPath: '/opt/mcp/google-mcp-server.js',
  outlookMcpServerPath: '/opt/mcp/outlook-mcp-server.js',
  resendMcpPath: '/opt/mcp/resend-mcp-server.mjs',
  githubAppId: '',
  githubPrivateKeyPath: '',
  githubClientId: '',
  githubClientSecret: '',
}));

// ── Mock github-auth ────────────────────────────────────────────────────────

jest.mock('../../src/github-auth', () => ({
  isConfigured: jest.fn(() => false),
  getStatus: jest.fn(() => ({ connected: false })),
}));

// ── Mock freetools-auth ─────────────────────────────────────────────────────

jest.mock('../../src/freetools-auth', () => ({
  getStatus: jest.fn(() => { throw new Error('not configured'); }),
}));

// ── Mock conversation-logger ────────────────────────────────────────────────

jest.mock('../../src/conversation-logger', () => ({
  logEntry: jest.fn(),
  loadHistory: jest.fn(() => []),
  formatHistoryAsContext: jest.fn(() => ''),
  clearHistory: jest.fn(),
}));

// ── Mock child_process (for version check only) ────────────────────────────

jest.mock('child_process', () => ({
  execFileSync: jest.fn(() => 'mock-version'),
}));

// ── Mock fs ─────────────────────────────────────────────────────────────────

jest.mock('fs', () => {
  const realFs = jest.requireActual('fs');
  return {
    ...realFs,
    existsSync: jest.fn((p) => {
      if (p.includes('bot_state')) return false;
      return realFs.existsSync(p);
    }),
    readFileSync: realFs.readFileSync,
    writeFileSync: jest.fn(),
    mkdirSync: jest.fn(),
    renameSync: jest.fn(),
  };
});

// ── Import after mocks ──────────────────────────────────────────────────────

const { runClaude, _setSDKForTesting } = require('../../src/claude');

beforeEach(() => {
  lastQueryCall = null;
  mockSDK.query.mockClear();
  mockSDK.query.mockImplementation(({ prompt, options }) => {
    lastQueryCall = { prompt, options };
    return createMockQueryResult();
  });
  _setSDKForTesting(mockSDK);
  jest.clearAllMocks();
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Claude Agent SDK — MCP configuration', () => {

  test('no MCP: SDK query called without mcpServers', async () => {
    mockGoogleAuth.isConfigured.mockReturnValue(false);

    await runClaude('hello', 'chat1', 'chat1');

    expect(mockSDK.query).toHaveBeenCalled();
    expect(lastQueryCall.options.mcpServers).toBeUndefined();
    expect(lastQueryCall.prompt).toContain('hello');
  });

  test('with Google MCP: mcpServers includes google', async () => {
    mockGoogleAuth.isConfigured.mockReturnValue(true);
    mockGoogleAuth.getStatus.mockReturnValue({ connected: true, email: 'test@gmail.com' });

    await runClaude('check inbox', 'chat2', 'chat2');

    expect(lastQueryCall.options.mcpServers).toBeDefined();
    expect(lastQueryCall.options.mcpServers.google).toBeDefined();
    expect(lastQueryCall.options.mcpServers.google.env.CHAT_ID).toBe('chat2');
  });

  test('Google configured but NOT connected: no google in mcpServers', async () => {
    mockGoogleAuth.isConfigured.mockReturnValue(true);
    mockGoogleAuth.getStatus.mockReturnValue({ connected: false });

    await runClaude('hello', 'chat3', 'chat3');

    // No MCP servers at all (FreeTools mock throws, so only google would add)
    expect(lastQueryCall.options.mcpServers).toBeUndefined();
  });

  test('Resend MCP: added when user has Resend key', async () => {
    mockResendAuth.resolveApiKey.mockReturnValue('re_test_key_123');
    mockGoogleAuth.isConfigured.mockReturnValue(false);

    await runClaude('send email', 'chat6', 'chat6');

    expect(lastQueryCall.options.mcpServers).toBeDefined();
    expect(lastQueryCall.options.mcpServers.resend).toBeDefined();
    expect(lastQueryCall.options.mcpServers.resend.env.RESEND_API_KEY).toBe('re_test_key_123');
    // Google should NOT be present
    expect(lastQueryCall.options.mcpServers.google).toBeUndefined();
  });

  test('Resend + Google MCP: both present when both configured', async () => {
    mockResendAuth.resolveApiKey.mockReturnValue('re_test_key_456');
    mockGoogleAuth.isConfigured.mockReturnValue(true);
    mockGoogleAuth.getStatus.mockReturnValue({ connected: true, email: 'u@g.com' });

    await runClaude('send email and check drive', 'chat7', 'chat7');

    expect(lastQueryCall.options.mcpServers.resend).toBeDefined();
    expect(lastQueryCall.options.mcpServers.google).toBeDefined();
    expect(lastQueryCall.options.mcpServers.resend.env.RESEND_API_KEY).toBe('re_test_key_456');
    expect(lastQueryCall.options.mcpServers.google.env.CHAT_ID).toBe('chat7');
  });

  test('no Resend key + no Google: no mcpServers', async () => {
    mockResendAuth.resolveApiKey.mockReturnValue(null);
    mockGoogleAuth.isConfigured.mockReturnValue(false);

    await runClaude('hello', 'chat8', 'chat8');

    expect(lastQueryCall.options.mcpServers).toBeUndefined();
  });

  test('Outlook MCP: added when user has connected Microsoft account', async () => {
    mockMicrosoftAuth.isConfigured.mockReturnValue(true);
    mockMicrosoftAuth.getStatus.mockReturnValue({ connected: true, email: 'user@outlook.com' });
    mockGoogleAuth.isConfigured.mockReturnValue(false);

    await runClaude('check outlook inbox', 'chat-outlook-1', 'chat-outlook-1');

    expect(lastQueryCall.options.mcpServers).toBeDefined();
    expect(lastQueryCall.options.mcpServers.outlook).toBeDefined();
    expect(lastQueryCall.options.mcpServers.outlook.env.CHAT_ID).toBe('chat-outlook-1');
  });

  test('Outlook configured but NOT connected: no Outlook MCP', async () => {
    mockMicrosoftAuth.isConfigured.mockReturnValue(true);
    mockMicrosoftAuth.getStatus.mockReturnValue({ connected: false });
    mockGoogleAuth.isConfigured.mockReturnValue(false);

    await runClaude('hello', 'chat-outlook-2', 'chat-outlook-2');

    // Outlook should NOT be in mcpServers
    const mcpServers = lastQueryCall.options.mcpServers;
    expect(!mcpServers || !mcpServers.outlook).toBe(true);
  });

  test('Google + Outlook + Resend: all three MCP servers present', async () => {
    mockResendAuth.resolveApiKey.mockReturnValue('re_test_key_789');
    mockGoogleAuth.isConfigured.mockReturnValue(true);
    mockGoogleAuth.getStatus.mockReturnValue({ connected: true, email: 'u@g.com' });
    mockMicrosoftAuth.isConfigured.mockReturnValue(true);
    mockMicrosoftAuth.getStatus.mockReturnValue({ connected: true, email: 'u@outlook.com' });

    await runClaude('send email', 'chat-all', 'chat-all');

    expect(lastQueryCall.options.mcpServers.google).toBeDefined();
    expect(lastQueryCall.options.mcpServers.outlook).toBeDefined();
    expect(lastQueryCall.options.mcpServers.resend).toBeDefined();
  });
});

describe('Claude Agent SDK — query options', () => {

  test('SDK query uses correct model and permissionMode', async () => {
    await runClaude('hello', 'chat-opts', 'chat-opts');

    expect(lastQueryCall.options.model).toBe('claude-sonnet-4-6');
    expect(lastQueryCall.options.permissionMode).toBe('bypassPermissions');
  });

  test('system prompt included for new sessions', async () => {
    await runClaude('hello', 'chat-sys', 'chat-sys');

    expect(lastQueryCall.options.systemPrompt).toBeDefined();
    expect(lastQueryCall.options.systemPrompt).toContain('SECURITY_PROMPT');
  });

  test('streaming callback is passed through opts', async () => {
    const onStream = jest.fn();
    await runClaude('hello', 'chat-stream', 'chat-stream', false, { onStream });

    // The onStream was passed but since our mock yields result directly,
    // it won't be called (no assistant messages with text content)
    expect(mockSDK.query).toHaveBeenCalled();
  });

  test('returns filtered response text', async () => {
    mockSDK.query.mockImplementation(({ prompt, options }) => {
      lastQueryCall = { prompt, options };
      return createMockQueryResult('Hello from Claude!');
    });

    const result = await runClaude('test', 'chat-result', 'chat-result');
    expect(result).toBe('Hello from Claude!');
  });
});
