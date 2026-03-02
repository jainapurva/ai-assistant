/**
 * Tests for Claude CLI spawn behavior with MCP config.
 *
 * These tests guard the core invariant: when --mcp-config is present,
 * the prompt must be piped via shell (not passed as a CLI arg) because
 * Claude CLI silently produces 0 bytes otherwise.
 *
 * Adding new MCP servers doesn't require new tests here — these cover
 * the spawn mechanism that applies to ALL MCP usage.
 */

const { EventEmitter } = require('events');
const { Readable } = require('stream');

// ── Track spawn calls ───────────────────────────────────────────────────────

let mockLastContainerArgs = null;
let mockLastContainerPipePrompt = null;
let mockLastSpawnArgs = null;
let mockLastSpawnOpts = null;
let mockProc = null;

function mockCreateProc() {
  const proc = new EventEmitter();
  proc.stdout = new Readable({ read() {} });
  proc.stderr = new Readable({ read() {} });
  proc._stoppedByUser = false;
  proc.kill = jest.fn();
  mockProc = proc;
  return proc;
}

// ── Mock child_process ──────────────────────────────────────────────────────

jest.mock('child_process', () => ({
  spawn: jest.fn((cmd, args, opts) => {
    mockLastSpawnArgs = args;
    mockLastSpawnOpts = opts;
    return mockCreateProc();
  }),
  execFileSync: jest.fn(),
}));

// ── Mock sandbox ────────────────────────────────────────────────────────────

jest.mock('../../src/sandbox', () => ({
  isDockerAvailable: jest.fn(() => true),
  spawnInContainer: jest.fn((chatId, args, env, pipePrompt) => {
    mockLastContainerArgs = args;
    mockLastContainerPipePrompt = pipePrompt;
    return Promise.resolve(mockCreateProc());
  }),
  markContainerUsed: jest.fn(),
}));

// ── Mock google-auth ────────────────────────────────────────────────────────

const mockGoogleAuth = {
  isConfigured: jest.fn(() => false),
  getStatus: jest.fn(() => ({ connected: false })),
};
jest.mock('../../src/google-auth', () => mockGoogleAuth);

// ── Mock resend-auth ───────────────────────────────────────────────────────

const mockResendAuth = {
  resolveApiKey: jest.fn(() => null),
};
jest.mock('../../src/resend-auth', () => mockResendAuth);

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
  resendMcpPath: '/opt/mcp/resend-mcp-server.mjs',
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
  };
});

// ── Import after mocks ──────────────────────────────────────────────────────

const { runClaude } = require('../../src/claude');
const sandbox = require('../../src/sandbox');
const mockConfig = require('../../src/config');

// Helper: emit a successful close event on the mock proc
function resolveProc(result = 'test response') {
  setTimeout(() => {
    const json = JSON.stringify({
      type: 'result',
      result,
      session_id: 'test-session',
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    mockProc.stdout.push(json);
    mockProc.stdout.push(null);
    mockProc.emit('close', 0);
  }, 50);
}

beforeEach(() => {
  mockLastContainerArgs = null;
  mockLastContainerPipePrompt = null;
  mockLastSpawnArgs = null;
  mockLastSpawnOpts = null;
  mockProc = null;
  jest.clearAllMocks();
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Claude CLI spawn — MCP prompt piping', () => {

  test('no MCP: prompt is CLI arg, pipePrompt is null', async () => {
    mockGoogleAuth.isConfigured.mockReturnValue(false);

    resolveProc();
    await runClaude('hello', 'chat1', 'chat1');

    expect(sandbox.spawnInContainer).toHaveBeenCalled();
    const args = mockLastContainerArgs;

    // Prompt should be the last argument (contains "hello")
    expect(args[args.length - 1]).toContain('hello');
    // pipePrompt should be null
    expect(mockLastContainerPipePrompt).toBeNull();
  });

  test('with MCP: --mcp-config in args, pipePrompt contains the prompt', async () => {
    mockGoogleAuth.isConfigured.mockReturnValue(true);
    mockGoogleAuth.getStatus.mockReturnValue({ connected: true, email: 'test@gmail.com' });

    resolveProc();
    await runClaude('check inbox', 'chat2', 'chat2');

    const args = mockLastContainerArgs;

    // --mcp-config should be in args with valid JSON
    expect(args).toContain('--mcp-config');
    const mcpIdx = args.indexOf('--mcp-config');
    const mcpJson = JSON.parse(args[mcpIdx + 1]);
    expect(mcpJson.mcpServers.google).toBeDefined();

    // Last arg is the placeholder (actual prompt goes via pipePrompt)
    expect(args[args.length - 1]).toBe('__PIPE_PROMPT__');

    // pipePrompt should contain the actual prompt text
    expect(mockLastContainerPipePrompt).toContain('check inbox');
    expect(mockLastContainerPipePrompt).not.toBeNull();
  });

  test('Google configured but NOT connected: no MCP, prompt as CLI arg', async () => {
    mockGoogleAuth.isConfigured.mockReturnValue(true);
    mockGoogleAuth.getStatus.mockReturnValue({ connected: false });

    resolveProc();
    await runClaude('hello', 'chat3', 'chat3');

    const args = mockLastContainerArgs;

    expect(args).not.toContain('--mcp-config');
    expect(args[args.length - 1]).toContain('hello');
    expect(mockLastContainerPipePrompt).toBeNull();
  });

  test('MCP config has correct container paths and chatId', async () => {
    mockGoogleAuth.isConfigured.mockReturnValue(true);
    mockGoogleAuth.getStatus.mockReturnValue({ connected: true, email: 'u@g.com' });

    resolveProc();
    await runClaude('test', 'user-555@c.us', 'user-555@c.us');

    const args = mockLastContainerArgs;
    const mcpJson = JSON.parse(args[args.indexOf('--mcp-config') + 1]);
    const google = mcpJson.mcpServers.google;

    expect(google.command).toBe('/usr/local/bin/node');
    expect(google.args[0]).toBe('/opt/mcp/google-mcp-server.js');
    expect(google.env.BOT_API_URL).toContain('host.docker.internal');
    expect(google.env.CHAT_ID).toBe('user-555@c.us');
  });

  test('host fallback with MCP: still passes prompt as CLI arg (no shell pipe on host)', async () => {
    mockGoogleAuth.isConfigured.mockReturnValue(true);
    mockGoogleAuth.getStatus.mockReturnValue({ connected: true, email: 'a@b.com' });
    sandbox.spawnInContainer.mockRejectedValueOnce(new Error('docker unavailable'));

    resolveProc();
    await runClaude('test', 'chat5', 'chat5');

    // Falls back to direct spawn — stdin is ignore (host doesn't need shell pipe)
    const { spawn } = require('child_process');
    expect(spawn).toHaveBeenCalled();
    expect(mockLastSpawnOpts.stdio[0]).toBe('ignore');
  });

  test('Resend MCP: added to mcpServers when user has Resend key', async () => {
    mockResendAuth.resolveApiKey.mockReturnValue('re_test_key_123');
    mockGoogleAuth.isConfigured.mockReturnValue(false);

    resolveProc();
    await runClaude('send email', 'chat6', 'chat6');

    const args = mockLastContainerArgs;

    // --mcp-config should be present (Resend alone triggers MCP)
    expect(args).toContain('--mcp-config');
    const mcpIdx = args.indexOf('--mcp-config');
    const mcpJson = JSON.parse(args[mcpIdx + 1]);

    expect(mcpJson.mcpServers.resend).toBeDefined();
    expect(mcpJson.mcpServers.resend.command).toBe('/usr/local/bin/node');
    expect(mcpJson.mcpServers.resend.args[0]).toBe('/opt/mcp/resend-mcp-server.mjs');
    expect(mcpJson.mcpServers.resend.env.RESEND_API_KEY).toBe('re_test_key_123');

    // Google should NOT be present
    expect(mcpJson.mcpServers.google).toBeUndefined();

    // pipePrompt should be set (MCP active)
    expect(mockLastContainerPipePrompt).toContain('send email');
  });

  test('Resend + Google MCP: both present when both configured', async () => {
    mockResendAuth.resolveApiKey.mockReturnValue('re_test_key_456');
    mockGoogleAuth.isConfigured.mockReturnValue(true);
    mockGoogleAuth.getStatus.mockReturnValue({ connected: true, email: 'u@g.com' });

    resolveProc();
    await runClaude('send email and check drive', 'chat7', 'chat7');

    const args = mockLastContainerArgs;
    const mcpJson = JSON.parse(args[args.indexOf('--mcp-config') + 1]);

    // Both MCP servers present
    expect(mcpJson.mcpServers.resend).toBeDefined();
    expect(mcpJson.mcpServers.google).toBeDefined();
    expect(mcpJson.mcpServers.resend.env.RESEND_API_KEY).toBe('re_test_key_456');
    expect(mcpJson.mcpServers.google.env.CHAT_ID).toBe('chat7');
  });

  test('no Resend key + no Google: no MCP, prompt as CLI arg', async () => {
    mockResendAuth.resolveApiKey.mockReturnValue(null);
    mockGoogleAuth.isConfigured.mockReturnValue(false);

    resolveProc();
    await runClaude('hello', 'chat8', 'chat8');

    const args = mockLastContainerArgs;
    expect(args).not.toContain('--mcp-config');
    expect(args[args.length - 1]).toContain('hello');
    expect(mockLastContainerPipePrompt).toBeNull();
  });

  test('no user Resend key: prompt tells user about /resend setup', async () => {
    mockResendAuth.resolveApiKey.mockReturnValue(null);
    mockGoogleAuth.isConfigured.mockReturnValue(false);

    resolveProc();
    await runClaude('send email via resend', 'chat9', 'chat9');

    const args = mockLastContainerArgs;
    expect(args).not.toContain('--mcp-config');
    // The prompt should mention /resend
    expect(args[args.length - 1]).toContain('/resend');
  });
});
