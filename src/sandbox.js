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

  logger.info('sandbox: initialized (disk monitor 5m)');
}

/**
 * Shutdown sandbox timers.
 */
function shutdown() {
  if (diskMonitorTimer) clearInterval(diskMonitorTimer);
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

  // Add tools (read-only)
  const invoicePdfBundle = path.resolve(__dirname, '..', 'dist', 'invoice-pdf.bundle.js');
  const invoicePdfData = path.resolve(__dirname, '..', 'dist', 'data');
  if (fs.existsSync(invoicePdfBundle)) {
    bwrapArgs.push('--ro-bind', invoicePdfBundle, '/opt/tools/invoice-pdf.js');
  }
  if (fs.existsSync(invoicePdfData)) {
    bwrapArgs.push('--ro-bind', invoicePdfData, '/opt/tools/data');
  }

  // Add MCP server mounts at /opt/mcp/ (read-only)
  const mcpMounts = [
    { host: path.resolve(config.mcpServerPath), internal: '/opt/mcp/google-mcp-server.js' },
    { host: path.resolve(config.outlookMcpServerPath), internal: '/opt/mcp/outlook-mcp-server.js' },
    { host: path.resolve(config.githubMcpServerPath), internal: '/opt/mcp/github-mcp-server.js' },
    { host: path.resolve(config.resendMcpPath), internal: '/opt/mcp/resend-mcp-server.mjs' },
    { host: path.resolve(config.tradingMcpPath), internal: '/opt/mcp/trading-mcp-server.js' },
    { host: path.resolve(config.freetoolsMcpPath), internal: '/opt/mcp/freetools-mcp-server.js' },
    { host: path.resolve(config.jobHunterMcpPath), internal: '/opt/mcp/job-hunter-mcp-server.js' },
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

/**
 * Check if a user has an existing sandbox (i.e. has interacted before).
 */
function hasSandbox(chatId) {
  const sandboxDir = getSandboxDir(chatId);
  return fs.existsSync(path.join(sandboxDir, 'workspace'));
}

module.exports = {
  hashChatId,
  getSandboxDir,
  hasSandbox,
  isBwrapAvailable,
  spawnInBwrap,
  getSandboxStatus,
  cleanWorkspace,
  checkDiskUsage,
  ensureSandboxDirs,
  init,
  shutdown,
};
