// Spawn the Claude CLI inside bwrap and yield stream-json events as an async
// iterator with the same shape as the Claude Agent SDK's query() iterator.
//
// This is the kernel-enforced isolation layer for per-user Claude queries:
// inside bwrap only /workspace is writable, so a compromised session cannot
// reach .env, src/, other users' workspaces, etc. The application-layer
// sdk-guard is no longer load-bearing on this path (it's defense-in-depth).
//
// Caller (claude.js runClaude) does not need to change its message-handling
// loop — the yielded objects are the same shape the SDK emits (`{type:
// 'system', subtype: 'init', session_id}`, `{type: 'assistant', message}`,
// `{type: 'result', usage, result, total_cost_usd}`, etc).

const fs = require('fs');
const path = require('path');
const sandbox = require('./sandbox');
const config = require('./config');
const logger = require('./logger');

// Map host MCP server paths to the bwrap-internal paths used by sandbox.js.
// Keep this in sync with the `mcpMounts` list in sandbox.js:spawnInBwrap.
function bwrapMcpInternalPath(hostPath) {
  if (!hostPath) return hostPath;
  const resolved = path.resolve(hostPath);
  const map = {
    [path.resolve(config.mcpServerPath || '')]: '/opt/mcp/google-mcp-server.js',
    [path.resolve(config.outlookMcpServerPath || '')]: '/opt/mcp/outlook-mcp-server.js',
    [path.resolve(config.githubMcpServerPath || '')]: '/opt/mcp/github-mcp-server.js',
    [path.resolve(config.resendMcpPath || '')]: '/opt/mcp/resend-mcp-server.mjs',
    [path.resolve(config.tradingMcpPath || '')]: '/opt/mcp/trading-mcp-server.js',
    [path.resolve(config.freetoolsMcpPath || '')]: '/opt/mcp/freetools-mcp-server.js',
    [path.resolve(config.hostSubdomainMcpPath || '')]: '/opt/mcp/host-subdomain-mcp-server.js',
    [path.resolve(config.jobHunterMcpPath || '')]: '/opt/mcp/job-hunter-mcp-server.js',
    [path.resolve(config.scheduleMcpPath || '')]: '/opt/mcp/schedule-mcp-server.js',
  };
  return map[resolved] || hostPath;
}

// Translate SDK-shaped mcpServers ({name: {command, args, env}}) to a
// CLI-shaped mcp-config.json with bwrap-internal paths.
function translateMcpServers(sdkMcpServers) {
  const out = { mcpServers: {} };
  for (const [name, srv] of Object.entries(sdkMcpServers || {})) {
    out.mcpServers[name] = {
      command: '/opt/node/bin/node', // nodePath inside bwrap
      args: (srv.args || []).map((a) => bwrapMcpInternalPath(a)),
      env: srv.env || {},
    };
  }
  return out;
}

// Normalize CLI stream-json messages to the flat shape claude.js expects from
// the SDK iterator. CLI emits `{type:'assistant', message:{content:[...]}}`
// while the SDK iterator (and existing handler in claude.js:880) expects
// `{type:'assistant', content:[...]}`. Same for `user` (tool_result) messages.
function normalizeMessage(msg) {
  if (!msg || typeof msg !== 'object') return msg;
  if ((msg.type === 'assistant' || msg.type === 'user') && msg.message && Array.isArray(msg.message.content) && !Array.isArray(msg.content)) {
    return { ...msg, content: msg.message.content };
  }
  return msg;
}

// Parse a buffer of stream-json output into discrete message objects.
// Returns { messages, remainder } so partial trailing lines can be re-buffered.
function parseStreamJson(buf) {
  const messages = [];
  let remainder = buf;
  let nl;
  while ((nl = remainder.indexOf('\n')) !== -1) {
    const line = remainder.slice(0, nl).trim();
    remainder = remainder.slice(nl + 1);
    if (!line) continue;
    try {
      messages.push(normalizeMessage(JSON.parse(line)));
    } catch (e) {
      logger.warn(`bwrap-runner: dropping unparseable stream-json line: ${line.slice(0, 200)}`);
    }
  }
  return { messages, remainder };
}

/**
 * Run a Claude query inside bwrap and yield stream-json events.
 *
 * @param {object} opts
 * @param {string} opts.chatId        — for sandbox dir lookup + logging
 * @param {string} opts.sandboxKey    — overrides chatId for workspace selection
 * @param {string} opts.prompt        — user prompt (piped via stdin)
 * @param {string} opts.model         — Claude model id
 * @param {string|null} opts.sessionId — resume an existing session
 * @param {string|null} opts.systemPrompt — appended to default system prompt
 * @param {object} opts.mcpServers    — SDK-shaped mcpServers
 * @param {AbortController} opts.abortController
 * @returns {AsyncIterable<object>} stream of SDK-iterator-shaped messages
 */
function runQuery(opts) {
  const {
    chatId,
    sandboxKey,
    prompt,
    model,
    sessionId,
    systemPrompt,
    mcpServers,
    abortController,
  } = opts;

  // Build CLI args
  const claudeArgs = [
    '--print',
    '--output-format', 'stream-json',
    '--verbose', // required when output-format is stream-json
    '--dangerously-skip-permissions', // bwrap mount IS the boundary
    '--model', model,
  ];

  if (sessionId) {
    claudeArgs.push('--resume', sessionId);
  }
  if (systemPrompt) {
    claudeArgs.push('--append-system-prompt', systemPrompt);
  }

  // Write mcp config to claudeDir (bind-mounted at /home/user/.claude)
  const { claudeDir } = sandbox.ensureSandboxDirs(sandboxKey || chatId);
  if (mcpServers && Object.keys(mcpServers).length > 0) {
    const translated = translateMcpServers(mcpServers);
    const mcpFile = path.join(claudeDir, 'mcp-config.json');
    fs.writeFileSync(mcpFile, JSON.stringify(translated, null, 2), { mode: 0o600 });
    claudeArgs.push('--mcp-config', '/home/user/.claude/mcp-config.json');
  }

  // Spawn — pipePrompt sends the prompt via stdin
  const proc = sandbox.spawnInBwrap(sandboxKey || chatId, claudeArgs, {}, prompt);

  // Wire abort: kill the process group on signal
  if (abortController) {
    const onAbort = () => {
      try { proc.kill('SIGTERM'); } catch { /* ignore */ }
      // Hard-kill after grace
      setTimeout(() => { try { proc.kill('SIGKILL'); } catch { /* ignore */ } }, 3000).unref();
    };
    if (abortController.signal.aborted) onAbort();
    else abortController.signal.addEventListener('abort', onAbort, { once: true });
  }

  return makeAsyncIterator(proc, chatId);
}

function makeAsyncIterator(proc, chatId) {
  // Queue of parsed messages, plus a settled flag once stdout closes.
  const queue = [];
  let stdoutBuf = '';
  let stderrBuf = '';
  let resolveWaiter = null;
  let settled = false;
  let exitCode = null;
  let exitSignal = null;

  const wake = () => { if (resolveWaiter) { const r = resolveWaiter; resolveWaiter = null; r(); } };

  proc.stdout.on('data', (chunk) => {
    stdoutBuf += chunk.toString('utf8');
    const { messages, remainder } = parseStreamJson(stdoutBuf);
    stdoutBuf = remainder;
    for (const m of messages) queue.push(m);
    if (messages.length) wake();
  });

  proc.stderr.on('data', (chunk) => { stderrBuf += chunk.toString('utf8'); });

  proc.on('close', (code, signal) => {
    exitCode = code;
    exitSignal = signal;
    // Flush any trailing partial line
    if (stdoutBuf.trim()) {
      const { messages } = parseStreamJson(stdoutBuf + '\n');
      for (const m of messages) queue.push(m);
    }
    if (code !== 0) {
      logger.warn(`bwrap-runner: chat=${chatId} exit=${code} signal=${signal} stderr=${stderrBuf.slice(0, 500)}`);
    }
    settled = true;
    wake();
  });

  proc.on('error', (err) => {
    logger.error(`bwrap-runner: spawn error chat=${chatId}: ${err.message}`);
    settled = true;
    wake();
  });

  return {
    [Symbol.asyncIterator]() {
      return {
        next: async () => {
          while (queue.length === 0 && !settled) {
            await new Promise((r) => { resolveWaiter = r; });
          }
          if (queue.length > 0) {
            return { value: queue.shift(), done: false };
          }
          // Drained and settled. Surface a non-zero exit as an error so the
          // caller can treat it like an SDK exception.
          if (exitCode !== 0 && exitCode !== null) {
            const err = new Error(`Claude CLI exited ${exitCode}${exitSignal ? ` (signal ${exitSignal})` : ''}: ${stderrBuf.slice(0, 500)}`);
            err.exitCode = exitCode;
            err.signal = exitSignal;
            throw err;
          }
          return { value: undefined, done: true };
        },
      };
    },
  };
}

module.exports = {
  runQuery,
  _internals: { parseStreamJson, translateMcpServers, bwrapMcpInternalPath, makeAsyncIterator, normalizeMessage },
};
