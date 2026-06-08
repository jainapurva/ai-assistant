const { EventEmitter } = require('events');
const path = require('path');

jest.mock('../../src/logger', () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }));
jest.mock('../../src/config', () => ({
  mcpServerPath: '/host/google-mcp.js',
  outlookMcpServerPath: '/host/outlook-mcp.js',
  githubMcpServerPath: '/host/github-mcp.js',
  resendMcpPath: '/host/resend-mcp.mjs',
  tradingMcpPath: '/host/trading-mcp.js',
  freetoolsMcpPath: '/host/freetools-mcp.js',
  hostSubdomainMcpPath: '/host/host-subdomain-mcp.js',
  jobHunterMcpPath: '/host/job-hunter-mcp.js',
  scheduleMcpPath: '/host/schedule-mcp.js',
}));

// Stub sandbox.spawnInBwrap before requiring the runner
const mockSpawnInBwrap = jest.fn();
const mockEnsureSandboxDirs = jest.fn();
jest.mock('../../src/sandbox', () => ({
  spawnInBwrap: (...args) => mockSpawnInBwrap(...args),
  ensureSandboxDirs: (...args) => mockEnsureSandboxDirs(...args),
}));

const fs = require('fs');
const os = require('os');
const bwrap = require('../../src/claude-bwrap-runner');
const { parseStreamJson, translateMcpServers, bwrapMcpInternalPath, makeAsyncIterator, normalizeMessage } = bwrap._internals;

function makeFakeProc() {
  const proc = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.stdin = { write: jest.fn(), end: jest.fn() };
  proc.kill = jest.fn();
  return proc;
}

describe('normalizeMessage', () => {
  test('flattens assistant message.message.content -> message.content (SDK shape)', () => {
    const cli = { type: 'assistant', message: { content: [{ type: 'text', text: 'hi' }] }, session_id: 's1' };
    const out = normalizeMessage(cli);
    expect(out.content).toEqual([{ type: 'text', text: 'hi' }]);
    expect(out.type).toBe('assistant');
    expect(out.session_id).toBe('s1');
  });

  test('flattens user (tool_result) messages too', () => {
    const cli = { type: 'user', message: { content: [{ type: 'tool_result', content: 'x' }] } };
    expect(normalizeMessage(cli).content[0].type).toBe('tool_result');
  });

  test('does not flatten if content already set', () => {
    const flat = { type: 'assistant', content: [{ type: 'text', text: 'a' }] };
    expect(normalizeMessage(flat)).toEqual(flat);
  });

  test('leaves other message types alone', () => {
    const sys = { type: 'system', subtype: 'init', session_id: 'abc' };
    expect(normalizeMessage(sys)).toEqual(sys);
    const res = { type: 'result', result: 'done' };
    expect(normalizeMessage(res)).toEqual(res);
  });
});

describe('parseStreamJson', () => {
  test('parses complete JSON lines', () => {
    const { messages, remainder } = parseStreamJson('{"type":"a"}\n{"type":"b"}\n');
    expect(messages).toEqual([{ type: 'a' }, { type: 'b' }]);
    expect(remainder).toBe('');
  });

  test('buffers partial trailing line', () => {
    const { messages, remainder } = parseStreamJson('{"type":"a"}\n{"type":"b"');
    expect(messages).toEqual([{ type: 'a' }]);
    expect(remainder).toBe('{"type":"b"');
  });

  test('drops unparseable lines without crashing', () => {
    const { messages } = parseStreamJson('{"type":"a"}\nNOT JSON\n{"type":"b"}\n');
    expect(messages).toEqual([{ type: 'a' }, { type: 'b' }]);
  });

  test('skips blank lines', () => {
    const { messages } = parseStreamJson('\n\n{"type":"a"}\n\n');
    expect(messages).toEqual([{ type: 'a' }]);
  });
});

describe('bwrapMcpInternalPath', () => {
  test('rewrites known host paths to bwrap-internal', () => {
    expect(bwrapMcpInternalPath('/host/google-mcp.js')).toBe('/opt/mcp/google-mcp-server.js');
    expect(bwrapMcpInternalPath('/host/resend-mcp.mjs')).toBe('/opt/mcp/resend-mcp-server.mjs');
  });

  test('passes through unknown paths unchanged', () => {
    expect(bwrapMcpInternalPath('/random/path.js')).toBe('/random/path.js');
  });

  test('handles falsy input', () => {
    expect(bwrapMcpInternalPath(undefined)).toBe(undefined);
    expect(bwrapMcpInternalPath('')).toBe('');
  });
});

describe('translateMcpServers', () => {
  test('rewrites command to bwrap node + maps server paths', () => {
    const input = {
      google: { command: '/host/node', args: ['/host/google-mcp.js'], env: { FOO: 'bar' } },
      custom: { command: '/host/node', args: ['/random/x.js'], env: {} },
    };
    const out = translateMcpServers(input);
    expect(out.mcpServers.google.command).toBe('/opt/node/bin/node');
    expect(out.mcpServers.google.args).toEqual(['/opt/mcp/google-mcp-server.js']);
    expect(out.mcpServers.google.env).toEqual({ FOO: 'bar' });
    expect(out.mcpServers.custom.args).toEqual(['/random/x.js']);
  });

  test('handles empty/undefined input', () => {
    expect(translateMcpServers(undefined)).toEqual({ mcpServers: {} });
    expect(translateMcpServers({})).toEqual({ mcpServers: {} });
  });
});

describe('makeAsyncIterator', () => {
  test('yields parsed messages then completes on clean exit', async () => {
    const proc = makeFakeProc();
    const it = makeAsyncIterator(proc, 'chat-1');
    setImmediate(() => {
      proc.stdout.emit('data', Buffer.from('{"type":"system","subtype":"init","session_id":"abc"}\n'));
      proc.stdout.emit('data', Buffer.from('{"type":"assistant","message":{"content":[{"type":"text","text":"hi"}]}}\n'));
      proc.stdout.emit('data', Buffer.from('{"type":"result","result":"done","total_cost_usd":0.01}\n'));
      proc.emit('close', 0, null);
    });
    const collected = [];
    for await (const msg of it) collected.push(msg);
    expect(collected).toHaveLength(3);
    expect(collected[0].session_id).toBe('abc');
    expect(collected[2].type).toBe('result');
  });

  test('handles chunked stdout (message split across chunks)', async () => {
    const proc = makeFakeProc();
    const it = makeAsyncIterator(proc, 'chat-2');
    setImmediate(() => {
      proc.stdout.emit('data', Buffer.from('{"type":"system","sub'));
      proc.stdout.emit('data', Buffer.from('type":"init","session_id":"xy"}\n'));
      proc.emit('close', 0, null);
    });
    const collected = [];
    for await (const msg of it) collected.push(msg);
    expect(collected).toEqual([{ type: 'system', subtype: 'init', session_id: 'xy' }]);
  });

  test('throws on non-zero exit', async () => {
    const proc = makeFakeProc();
    const it = makeAsyncIterator(proc, 'chat-err');
    setImmediate(() => {
      proc.stderr.emit('data', Buffer.from('something failed'));
      proc.emit('close', 1, null);
    });
    let caught;
    try {
      for await (const _ of it) { /* drain */ }
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect(caught.exitCode).toBe(1);
    expect(caught.message).toMatch(/something failed/);
  });

  test('flushes trailing partial line on close', async () => {
    const proc = makeFakeProc();
    const it = makeAsyncIterator(proc, 'chat-flush');
    setImmediate(() => {
      // Last message has no trailing newline
      proc.stdout.emit('data', Buffer.from('{"type":"result","result":"x"}'));
      proc.emit('close', 0, null);
    });
    const collected = [];
    for await (const msg of it) collected.push(msg);
    expect(collected).toEqual([{ type: 'result', result: 'x' }]);
  });
});

describe('runQuery — CLI arg construction', () => {
  let tmpClaudeDir;
  beforeEach(() => {
    tmpClaudeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bwrap-runner-test-'));
    mockEnsureSandboxDirs.mockReturnValue({
      base: tmpClaudeDir, workspace: tmpClaudeDir, claudeDir: tmpClaudeDir,
    });
    mockSpawnInBwrap.mockImplementation(() => {
      const p = makeFakeProc();
      setImmediate(() => p.emit('close', 0, null));
      return p;
    });
  });
  afterEach(() => {
    fs.rmSync(tmpClaudeDir, { recursive: true, force: true });
    mockSpawnInBwrap.mockReset();
    mockEnsureSandboxDirs.mockReset();
  });

  test('passes --model, --print, stream-json, skip-permissions', async () => {
    const it = bwrap.runQuery({
      chatId: 'c1', sandboxKey: 'c1', prompt: 'hi', model: 'claude-sonnet-4-6',
      sessionId: null, systemPrompt: null, mcpServers: {}, abortController: new AbortController(),
    });
    for await (const _ of it) { /* drain */ }
    const [, args] = mockSpawnInBwrap.mock.calls[0];
    expect(args).toContain('--print');
    expect(args).toContain('--output-format');
    expect(args).toContain('stream-json');
    expect(args).toContain('--dangerously-skip-permissions');
    expect(args).toContain('--model');
    expect(args).toContain('claude-sonnet-4-6');
    expect(args).not.toContain('--resume'); // no session
    expect(args).not.toContain('--mcp-config'); // empty mcp
  });

  test('adds --resume when sessionId provided', async () => {
    const it = bwrap.runQuery({
      chatId: 'c2', sandboxKey: 'c2', prompt: 'hi', model: 'm',
      sessionId: 'sess-abc', systemPrompt: null, mcpServers: {}, abortController: new AbortController(),
    });
    for await (const _ of it) { /* drain */ }
    const [, args] = mockSpawnInBwrap.mock.calls[0];
    const idx = args.indexOf('--resume');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(args[idx + 1]).toBe('sess-abc');
  });

  test('writes mcp-config.json and passes --mcp-config when servers given', async () => {
    const it = bwrap.runQuery({
      chatId: 'c3', sandboxKey: 'c3', prompt: 'hi', model: 'm',
      sessionId: null, systemPrompt: null,
      mcpServers: { google: { command: '/host/node', args: ['/host/google-mcp.js'], env: {} } },
      abortController: new AbortController(),
    });
    for await (const _ of it) { /* drain */ }
    const mcpFile = path.join(tmpClaudeDir, 'mcp-config.json');
    expect(fs.existsSync(mcpFile)).toBe(true);
    const cfg = JSON.parse(fs.readFileSync(mcpFile, 'utf8'));
    expect(cfg.mcpServers.google.command).toBe('/opt/node/bin/node');
    expect(cfg.mcpServers.google.args).toEqual(['/opt/mcp/google-mcp-server.js']);
    const [, args] = mockSpawnInBwrap.mock.calls[0];
    expect(args).toContain('--mcp-config');
    expect(args).toContain('/home/user/.claude/mcp-config.json');
  });

  test('abort kills the subprocess', async () => {
    const ac = new AbortController();
    const it = bwrap.runQuery({
      chatId: 'c4', sandboxKey: 'c4', prompt: 'hi', model: 'm',
      sessionId: null, systemPrompt: null, mcpServers: {}, abortController: ac,
    });
    // Don't iterate — just abort and look at the spawned proc
    const spawnedProc = mockSpawnInBwrap.mock.results[0].value;
    ac.abort();
    // give the abort listener a tick to fire
    await new Promise((r) => setImmediate(r));
    expect(spawnedProc.kill).toHaveBeenCalledWith('SIGTERM');
    // drain so jest doesn't complain
    try { for await (const _ of it) {} } catch {}
  });
});
