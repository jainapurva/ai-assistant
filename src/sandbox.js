const { execFileSync, spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./logger');

// Resolve the real Claude binary path (follows symlinks)
let claudeBinaryPath;
try {
  claudeBinaryPath = fs.realpathSync(config.claudePath);
} catch {
  claudeBinaryPath = config.claudePath;
}

// Host credentials path
const CREDENTIALS_PATH = '/media/ddarji/storage/.claude/.credentials.json';
// Host Claude CLI config file ($HOME/.claude.json)
const CLAUDE_CONFIG_PATH = path.join(process.env.HOME || '/home/ddarji', '.claude.json');

// Timer handles for cleanup on shutdown
let diskMonitorTimer = null;
let tokenRefreshTimer = null;

// ── Proactive Claude OAuth token refresh ─────────────────────────────────────
// Claude CLI's OAuth access token expires periodically. When it does, the CLI
// uses the refresh token to get a new pair — but inside a bwrap sandbox the
// credentials file is read-only, so the new tokens can't be persisted. Worse,
// Anthropic rotates the refresh token on each use, invalidating the host copy.
//
// Fix: periodically run `claude --version` on the HOST (not sandboxed) which
// triggers the CLI's built-in token refresh and writes back to the host file.
const TOKEN_REFRESH_THRESHOLD_MS = 2 * 60 * 60 * 1000; // refresh if <2h left
const TOKEN_CHECK_INTERVAL_MS = 60 * 60 * 1000;        // check every 1h

function checkAndRefreshToken() {
  try {
    if (!fs.existsSync(CREDENTIALS_PATH)) return;
    const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
    const expiresAt = creds?.claudeAiOauth?.expiresAt;
    if (!expiresAt) return;

    const timeLeft = expiresAt - Date.now();
    const hoursLeft = (timeLeft / 3600000).toFixed(1);

    if (timeLeft <= 0) {
      logger.warn(`token-refresh: access token EXPIRED ${(-timeLeft / 3600000).toFixed(1)}h ago, attempting refresh...`);
    } else if (timeLeft < TOKEN_REFRESH_THRESHOLD_MS) {
      logger.info(`token-refresh: access token expires in ${hoursLeft}h, refreshing proactively...`);
    } else {
      logger.info(`token-refresh: access token valid for ${hoursLeft}h, no action needed`);
      return;
    }

    // Run `claude --version` on the HOST to trigger CLI's built-in refresh
    execFileSync(config.claudePath, ['--version'], {
      stdio: 'ignore',
      timeout: 30000,
      env: { ...process.env, HOME: process.env.HOME || '/home/ddarji' },
    });

    // Verify the token was actually refreshed
    const updated = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
    const newExpiry = updated?.claudeAiOauth?.expiresAt;
    if (newExpiry && newExpiry > expiresAt) {
      const newHoursLeft = ((newExpiry - Date.now()) / 3600000).toFixed(1);
      logger.info(`token-refresh: success — new token valid for ${newHoursLeft}h`);
    } else {
      logger.warn('token-refresh: ran claude --version but token expiry unchanged');
    }
  } catch (err) {
    logger.error(`token-refresh: failed — ${err.message}`);
  }
}

function hashChatId(chatId) {
  return crypto.createHash('sha256').update(chatId).digest('hex').slice(0, 12);
}

function getSandboxDir(chatId) {
  return path.join(config.sandboxBaseDir, hashChatId(chatId));
}

/**
 * Ensure per-user host directories exist.
 */
function ensureSandboxDirs(chatId) {
  const base = getSandboxDir(chatId);
  const workspace = path.join(base, 'workspace');
  const claudeDir = path.join(base, '.claude');
  fs.mkdirSync(workspace, { recursive: true });
  fs.mkdirSync(claudeDir, { recursive: true });
  return { base, workspace, claudeDir };
}

/**
 * Get sandbox status for a chatId.
 */
function getSandboxStatus(chatId) {
  const sandboxDir = getSandboxDir(chatId);
  const workspaceDir = path.join(sandboxDir, 'workspace');

  let diskUsageMB = 0;
  try {
    if (fs.existsSync(workspaceDir)) {
      const output = execFileSync('du', ['-sm', workspaceDir], {
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 5000,
      }).toString().trim();
      diskUsageMB = parseInt(output.split('\t')[0], 10) || 0;
    }
  } catch {}

  return {
    exists: fs.existsSync(sandboxDir),
    running: isBwrapAvailable(),
    status: isBwrapAvailable() ? 'bwrap' : 'unavailable',
    diskUsageMB,
    maxDiskMB: config.sandboxWorkspaceMaxMB,
    workspaceDir,
  };
}

/**
 * Clean workspace — remove all files except CLAUDE.md.
 */
function cleanWorkspace(chatId) {
  const workspaceDir = path.join(getSandboxDir(chatId), 'workspace');
  if (!fs.existsSync(workspaceDir)) return 0;

  let removed = 0;
  const entries = fs.readdirSync(workspaceDir);
  for (const entry of entries) {
    if (entry === 'CLAUDE.md') continue;
    const fullPath = path.join(workspaceDir, entry);
    try {
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        fs.rmSync(fullPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(fullPath);
      }
      removed++;
    } catch {}
  }
  return removed;
}

/**
 * Check disk usage of all sandboxes, log warnings if over limit.
 */
function checkDiskUsage() {
  if (!fs.existsSync(config.sandboxBaseDir)) return;

  try {
    const dirs = fs.readdirSync(config.sandboxBaseDir);
    for (const hash of dirs) {
      const workspaceDir = path.join(config.sandboxBaseDir, hash, 'workspace');
      if (!fs.existsSync(workspaceDir)) continue;

      try {
        const output = execFileSync('du', ['-sm', workspaceDir], {
          stdio: ['ignore', 'pipe', 'ignore'],
          timeout: 5000,
        }).toString().trim();
        const sizeMB = parseInt(output.split('\t')[0], 10) || 0;

        if (sizeMB > config.sandboxWorkspaceMaxMB) {
          const warningFile = path.join(workspaceDir, '.DISK_WARNING');
          fs.writeFileSync(warningFile, `Workspace is ${sizeMB}MB, limit is ${config.sandboxWorkspaceMaxMB}MB. Use /sandbox clean to free space.\n`);
          logger.warn(`sandbox: workspace ${hash} is ${sizeMB}MB (limit ${config.sandboxWorkspaceMaxMB}MB)`);
        }
      } catch {}
    }
  } catch (err) {
    logger.warn(`sandbox: disk check failed: ${err.message}`);
  }
}

/**
 * Initialize sandbox system: start monitors.
 */
function init() {
  // Ensure base directory exists
  fs.mkdirSync(config.sandboxBaseDir, { recursive: true });

  // Disk usage monitor — every 5 minutes
  diskMonitorTimer = setInterval(checkDiskUsage, 5 * 60 * 1000);
  diskMonitorTimer.unref();

  // Proactive token refresh — check every hour, refresh if <2h left
  checkAndRefreshToken(); // run immediately on startup
  tokenRefreshTimer = setInterval(checkAndRefreshToken, TOKEN_CHECK_INTERVAL_MS);
  tokenRefreshTimer.unref();

  logger.info('sandbox: initialized (disk monitor 5m, token refresh 1h)');
}

/**
 * Shutdown sandbox timers.
 */
function shutdown() {
  if (diskMonitorTimer) clearInterval(diskMonitorTimer);
  if (tokenRefreshTimer) clearInterval(tokenRefreshTimer);
}

// ── Bubblewrap (bwrap) lightweight sandbox ──────────────────────────────────
// Provides kernel-level filesystem isolation: only the user's workspace is
// visible, rest of the filesystem is hidden.

let _bwrapAvailable = null;
function isBwrapAvailable() {
  if (_bwrapAvailable !== null) return _bwrapAvailable;
  try {
    execFileSync('bwrap', ['--version'], { stdio: 'ignore', timeout: 3000 });
    _bwrapAvailable = true;
  } catch {
    _bwrapAvailable = false;
    logger.warn('sandbox: bubblewrap (bwrap) not available, filesystem isolation disabled');
  }
  return _bwrapAvailable;
}

/**
 * Spawn Claude inside a bubblewrap sandbox with full filesystem isolation.
 * Only the user's workspace is visible. All paths are remapped to clean
 * internal paths so no host directory structure is leaked.
 *
 * Internal layout:
 *   /workspace          — user's writable workspace
 *   /home/user/.claude  — per-user writable Claude config/session dir
 *   /opt/claude         — Claude CLI binary (read-only)
 *   /opt/node/bin/node  — Node.js binary (read-only)
 *   /opt/mcp/           — MCP server bundles (read-only)
 *
 * @param {string} chatId - User identifier (for workspace lookup)
 * @param {string[]} claudeArgs - Arguments to pass to the Claude CLI (paths should use internal layout)
 * @param {object} env - Environment variables (whitelisted)
 * @param {string|null} pipePrompt - If non-null, pipe this as stdin
 * @returns {ChildProcess}
 */
function spawnInBwrap(chatId, claudeArgs, env, pipePrompt = null) {
  const { workspace, claudeDir } = ensureSandboxDirs(chatId);
  const HOME = '/home/user';
  const CLAUDE_BIN = '/opt/claude/claude';
  const NODE_BIN_DIR = '/opt/node/bin';

  // Copy settings files if they exist
  const hostHome = process.env.HOME || '/home/ddarji';
  for (const f of ['settings.json', 'settings.local.json']) {
    const src = path.join(hostHome, '.claude', f);
    if (fs.existsSync(src)) {
      try { fs.copyFileSync(src, path.join(claudeDir, f)); } catch {}
    }
  }

  // Write a sanitized credentials file (access token only, no refresh token).
  // This prevents the sandbox from calling Anthropic's refresh endpoint, which
  // would rotate the refresh token server-side and invalidate the host's copy.
  try {
    const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
    if (creds?.claudeAiOauth) {
      const sanitized = {
        claudeAiOauth: { ...creds.claudeAiOauth, refreshToken: undefined },
      };
      fs.writeFileSync(
        path.join(claudeDir, '.credentials.json'),
        JSON.stringify(sanitized, null, 2),
        { mode: 0o600 }
      );
    }
  } catch (err) {
    logger.warn(`bwrap: failed to write sanitized credentials: ${err.message}`);
  }

  // Build bwrap args: clean internal paths only
  const bwrapArgs = [
    // System libraries (read-only)
    '--ro-bind', '/usr', '/usr',
    '--ro-bind', '/lib', '/lib',
    '--ro-bind', '/lib64', '/lib64',
    '--ro-bind', '/bin', '/bin',
    '--ro-bind', '/sbin', '/sbin',
    '--ro-bind', '/etc', '/etc',
    // DNS resolution (systemd-resolved symlink target)
    '--ro-bind', '/run/systemd/resolve', '/run/systemd/resolve',
    // Kernel interfaces
    '--proc', '/proc',
    '--dev', '/dev',
    '--tmpfs', '/tmp',
    // Node.js runtime at /opt/node/bin/ (read-only)
    '--ro-bind', path.dirname(config.nodeBinaryPath), NODE_BIN_DIR,
    // Claude CLI binary at /opt/claude/claude (read-only) — single file, not directory
    '--ro-bind', claudeBinaryPath, CLAUDE_BIN,
    // Claude CLI config file (read-only)
    ...(fs.existsSync(CLAUDE_CONFIG_PATH) ? ['--ro-bind', CLAUDE_CONFIG_PATH, `${HOME}/.claude.json`] : []),
    // Per-user .claude dir (writable — session data, history, sanitized credentials)
    '--bind', claudeDir, `${HOME}/.claude`,
    // User workspace (writable — the ONLY user-accessible data dir)
    '--bind', workspace, '/workspace',
    // Working directory
    '--chdir', '/workspace',
    // Namespace isolation (preserves network access)
    '--unshare-pid',
    '--unshare-ipc',
    '--unshare-uts',
    // Environment
    '--setenv', 'HOME', HOME,
    '--setenv', 'PATH', `${NODE_BIN_DIR}:/opt/claude:/usr/local/bin:/usr/bin:/bin`,
    '--setenv', 'TERM', 'dumb',
    '--unsetenv', 'CLAUDECODE',
  ];

  // Add MCP server mounts at /opt/mcp/ (read-only)
  const mcpMounts = [
    { host: path.resolve(config.mcpServerPath), internal: '/opt/mcp/google-mcp-server.js' },
    { host: path.resolve(config.resendMcpPath), internal: '/opt/mcp/resend-mcp-server.mjs' },
  ];
  for (const m of mcpMounts) {
    if (fs.existsSync(m.host)) {
      bwrapArgs.push('--ro-bind', m.host, m.internal);
    }
  }

  // Pass whitelisted env vars
  if (env) {
    for (const [key, val] of Object.entries(env)) {
      if (val !== undefined && val !== null && key !== 'HOME' && key !== 'TERM' && key !== 'PATH') {
        bwrapArgs.push('--setenv', key, val);
      }
    }
  }

  bwrapArgs.push('--');

  // Claude args (filter out __PIPE_PROMPT__ placeholder)
  const finalClaudeArgs = claudeArgs.filter(a => a !== '__PIPE_PROMPT__');
  const fullArgs = [...bwrapArgs, CLAUDE_BIN, ...finalClaudeArgs];

  const stdio = pipePrompt ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'];
  const proc = spawn('bwrap', fullArgs, { stdio });

  if (pipePrompt) {
    proc.stdin.write(pipePrompt);
    proc.stdin.end();
  }

  return proc;
}

module.exports = {
  hashChatId,
  getSandboxDir,
  isBwrapAvailable,
  spawnInBwrap,
  getSandboxStatus,
  cleanWorkspace,
  checkDiskUsage,
  ensureSandboxDirs,
  init,
  shutdown,
};
