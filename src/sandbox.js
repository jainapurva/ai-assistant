const { execFileSync, spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./logger');

const CONTAINER_PREFIX = 'ai-sandbox-';
const IMAGE_NAME = 'ai-assistant-sandbox:latest';

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

// Serialization: track containers being created to avoid races
const creating = new Set();

// Last-used timestamps for idle reaping
const lastUsed = new Map(); // containerName -> timestamp


// Cached docker availability
let _dockerAvailable = null;

// Timer handles for cleanup on shutdown
let diskMonitorTimer = null;
let reaperTimer = null;

function hashChatId(chatId) {
  return crypto.createHash('sha256').update(chatId).digest('hex').slice(0, 12);
}

function getContainerName(chatId) {
  return `${CONTAINER_PREFIX}${hashChatId(chatId)}`;
}

function getSandboxDir(chatId) {
  return path.join(config.sandboxBaseDir, hashChatId(chatId));
}

function isDockerAvailable() {
  if (_dockerAvailable !== null) return _dockerAvailable;
  try {
    execFileSync('docker', ['info'], { stdio: 'ignore', timeout: 5000 });
    _dockerAvailable = true;
  } catch {
    _dockerAvailable = false;
    logger.warn('sandbox: Docker not available, sandbox disabled');
  }
  return _dockerAvailable;
}

/**
 * Inspect container state. Returns null if not found, or { running, status }.
 */
function inspectContainer(containerName) {
  try {
    const out = execFileSync('docker', ['inspect', '--format', '{{.State.Running}} {{.State.Status}}', containerName], {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    }).toString().trim();
    const [running, status] = out.split(' ');
    return { running: running === 'true', status };
  } catch {
    return null;
  }
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
 * Ensure a Docker container exists and is running for this chatId.
 * Creates one if it doesn't exist, starts it if stopped.
 */
async function ensureContainer(chatId) {
  const containerName = getContainerName(chatId);

  // Serialize creation per chatId
  if (creating.has(chatId)) {
    // Wait for the in-flight creation to finish
    await new Promise(resolve => {
      const check = setInterval(() => {
        if (!creating.has(chatId)) {
          clearInterval(check);
          resolve();
        }
      }, 200);
    });
    return containerName;
  }

  const state = inspectContainer(containerName);

  if (state && state.running) {
    // Verify claude binary mount is still valid (auto-updates delete old versions)
    let claudeOk = true;
    try {
      execFileSync('docker', ['exec', containerName, 'test', '-f', '/usr/local/bin/claude'], { stdio: 'ignore', timeout: 5000 });
    } catch {
      claudeOk = false;
    }
    if (!claudeOk) {
      logger.info(`sandbox: claude binary missing in ${containerName}, recreating`);
      try { execFileSync('docker', ['rm', '-f', containerName], { stdio: 'ignore', timeout: 10000 }); } catch {}
      // Fall through to create new container below
    } else {
      return containerName;
    }
  }

  if (state && !state.running) {
    // Container exists but stopped — start it
    try {
      execFileSync('docker', ['start', containerName], { stdio: 'ignore', timeout: 10000 });
      logger.info(`sandbox: started existing container ${containerName}`);
      return containerName;
    } catch (err) {
      logger.warn(`sandbox: failed to start ${containerName}, recreating: ${err.message}`);
      try { execFileSync('docker', ['rm', '-f', containerName], { stdio: 'ignore', timeout: 5000 }); } catch {}
    }
  }

  // Create new container
  creating.add(chatId);
  try {
    const { workspace, claudeDir } = ensureSandboxDirs(chatId);

    const args = [
      'run', '-d',
      '--name', containerName,
      // Bind mounts — all persistent data on host, near-zero overlay writes
      '-v', `${claudeBinaryPath}:/usr/local/bin/claude:ro`,
      '-v', `${workspace}:/workspace`,
      '-v', `${claudeDir}:/home/claude/.claude`,
      // Credentials are copied fresh before each spawn (see spawnInContainer)
      // Node.js binary + MCP server bundle (for Google MCP integration)
      '-v', `${config.nodeBinaryPath}:/usr/local/bin/node:ro`,
      '-v', `${path.resolve(config.mcpServerPath)}:/opt/mcp/google-mcp-server.js:ro`,
      '-v', `${path.resolve(config.resendMcpPath)}:/opt/mcp/resend-mcp-server.mjs:ro`,
      // Playwright MCP — needs full package tree (cli.js + playwright + playwright-core)
      '-v', `${path.resolve(path.dirname(config.playwrightMcpPath))}:/opt/mcp/node_modules/@playwright/mcp:ro`,
      '-v', `${path.resolve(path.join(path.dirname(config.playwrightMcpPath), '..', '..', 'playwright'))}:/opt/mcp/node_modules/playwright:ro`,
      '-v', `${path.resolve(path.join(path.dirname(config.playwrightMcpPath), '..', '..', 'playwright-core'))}:/opt/mcp/node_modules/playwright-core:ro`,
      '-v', `${config.playwrightBrowsersPath}:/opt/playwright-browsers:ro`,
    ];

    // Claude CLI config file (auth, settings) — mount if it exists on host
    if (fs.existsSync(CLAUDE_CONFIG_PATH)) {
      args.push('-v', `${CLAUDE_CONFIG_PATH}:/home/claude/.claude.json:ro`);
    }

    args.push(
      // Working directory
      '-w', '/workspace',
      // Resource limits
      '--memory', config.sandboxMemory,
      '--cpus', config.sandboxCpus,
      '--pids-limit', config.sandboxPidsLimit,
      // Tmpfs for /tmp — prevents overlay bloat from temp files
      '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m',
      // Allow container to reach host services (internal API)
      '--add-host', 'host.docker.internal:host-gateway',
      // Security
      '--security-opt', 'no-new-privileges',
      IMAGE_NAME,
    );

    execFileSync('docker', args, { stdio: 'ignore', timeout: 30000 });
    logger.info(`sandbox: created container ${containerName} for ${hashChatId(chatId)}`);
    markContainerUsed(chatId);
    return containerName;
  } catch (err) {
    throw new Error(`Failed to create sandbox container: ${err.message}`);
  } finally {
    creating.delete(chatId);
  }
}

/**
 * Spawn a process inside the user's container. Returns a ChildProcess with stdout/stderr piped.
 * @param {string|null} pipePrompt - If non-null, pipe this prompt via shell instead of passing as CLI arg.
 *   This is needed because Claude CLI --mcp-config silently fails when prompt is a CLI arg.
 */
async function spawnInContainer(chatId, args, env, pipePrompt = null) {
  const containerName = await ensureContainer(chatId);

  // Copy fresh credentials into sandbox (avoids stale bind-mount inode issue)
  try {
    const sandboxClaudeDir = path.join(getSandboxDir(chatId), '.claude');
    fs.copyFileSync(CREDENTIALS_PATH, path.join(sandboxClaudeDir, '.credentials.json'));
  } catch (err) {
    logger.warn(`sandbox: failed to copy credentials for ${containerName}: ${err.message}`);
  }

  // Build docker exec args with env vars
  const dockerArgs = ['exec'];

  // Pass through environment variables, but override HOME and USER
  // for the container's filesystem layout (credentials at /home/claude/.claude/)
  if (env) {
    for (const [key, val] of Object.entries(env)) {
      if (val !== undefined && val !== null) {
        dockerArgs.push('-e', `${key}=${val}`);
      }
    }
  }
  // Always override HOME/USER to match the container's claude user
  dockerArgs.push('-e', 'HOME=/home/claude');
  dockerArgs.push('-e', 'USER=claude');

  if (pipePrompt) {
    // Pipe prompt via shell: sh -c 'printf "%s" "PROMPT" | claude -p ...'
    // Remove the placeholder prompt from args
    const claudeArgs = args.filter(a => a !== '__PIPE_PROMPT__');
    // Escape single quotes in prompt for shell safety
    const escaped = pipePrompt.replace(/'/g, "'\\''");
    const shellCmd = `printf '%s' '${escaped}' | claude ${claudeArgs.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' ')}`;
    dockerArgs.push(containerName, 'sh', '-c', shellCmd);
  } else {
    dockerArgs.push(containerName, 'claude', ...args);
  }

  const proc = spawn('docker', dockerArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return proc;
}

/**
 * Remove a container for a chatId.
 */
function removeContainer(chatId) {
  const containerName = getContainerName(chatId);
  try {
    execFileSync('docker', ['rm', '-f', containerName], { stdio: 'ignore', timeout: 10000 });
    logger.info(`sandbox: removed container ${containerName}`);
  } catch {
    // Container might not exist, that's fine
  }
  lastUsed.delete(containerName);
  containerCredInode.delete(containerName);
}

/**
 * Get sandbox status for a chatId.
 */
function getSandboxStatus(chatId) {
  const containerName = getContainerName(chatId);
  const state = inspectContainer(containerName);
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
    containerName,
    exists: !!state,
    running: state ? state.running : false,
    status: state ? state.status : 'not created',
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

function markContainerUsed(chatId) {
  lastUsed.set(getContainerName(chatId), Date.now());
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
 * Reap containers that have been idle longer than the configured timeout.
 */
function reapIdleContainers() {
  try {
    const output = execFileSync('docker', ['ps', '-a', '--filter', `name=${CONTAINER_PREFIX}`, '--format', '{{.Names}}'], {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    }).toString().trim();

    if (!output) return;

    const containers = output.split('\n').filter(Boolean);
    const now = Date.now();

    for (const name of containers) {
      const lu = lastUsed.get(name) || 0;
      if (lu === 0) {
        // Unknown container — check its start time via docker inspect
        try {
          const started = execFileSync('docker', ['inspect', '--format', '{{.State.StartedAt}}', name], {
            stdio: ['ignore', 'pipe', 'ignore'],
            timeout: 5000,
          }).toString().trim();
          const startedMs = new Date(started).getTime();
          if (now - startedMs > config.sandboxIdleTimeoutMs) {
            execFileSync('docker', ['rm', '-f', name], { stdio: 'ignore', timeout: 5000 });
            logger.info(`sandbox: reaped idle container ${name} (no recent activity)`);
            lastUsed.delete(name);
          } else {
            lastUsed.set(name, startedMs);
          }
        } catch {}
      } else if (now - lu > config.sandboxIdleTimeoutMs) {
        try {
          execFileSync('docker', ['rm', '-f', name], { stdio: 'ignore', timeout: 5000 });
          logger.info(`sandbox: reaped idle container ${name} (idle ${Math.round((now - lu) / 3600000)}h)`);
          lastUsed.delete(name);
        } catch {}
      }
    }
  } catch (err) {
    logger.warn(`sandbox: reap failed: ${err.message}`);
  }
}

/**
 * Initialize sandbox system: prune dangling images, start monitors.
 */
function init() {
  if (!isDockerAvailable()) return;

  // Startup prune — remove dangling images and stopped containers
  try {
    execFileSync('docker', ['system', 'prune', '-f'], { stdio: 'ignore', timeout: 30000 });
    logger.info('sandbox: startup prune complete');
  } catch (err) {
    logger.warn(`sandbox: startup prune failed: ${err.message}`);
  }

  // Ensure base directory exists
  fs.mkdirSync(config.sandboxBaseDir, { recursive: true });

  // Disk usage monitor — every 5 minutes
  diskMonitorTimer = setInterval(checkDiskUsage, 5 * 60 * 1000);
  diskMonitorTimer.unref();

  // Idle container reaper — every hour
  reaperTimer = setInterval(reapIdleContainers, 60 * 60 * 1000);
  reaperTimer.unref();

  logger.info('sandbox: initialized (disk monitor 5m, reaper 1h)');
}

/**
 * Shutdown sandbox timers.
 */
function shutdown() {
  if (diskMonitorTimer) clearInterval(diskMonitorTimer);
  if (reaperTimer) clearInterval(reaperTimer);
}

// ── Bubblewrap (bwrap) lightweight sandbox ──────────────────────────────────
// Used when Docker sandbox is disabled. Provides kernel-level filesystem
// isolation: only the user's workspace is visible, rest of the filesystem is hidden.

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

  // Copy fresh credentials into the user's .claude dir
  try {
    fs.copyFileSync(CREDENTIALS_PATH, path.join(claudeDir, '.credentials.json'));
  } catch (err) {
    logger.warn(`bwrap: failed to copy credentials: ${err.message}`);
  }

  // Copy settings files if they exist
  const hostHome = process.env.HOME || '/home/ddarji';
  for (const f of ['settings.json', 'settings.local.json']) {
    const src = path.join(hostHome, '.claude', f);
    if (fs.existsSync(src)) {
      try { fs.copyFileSync(src, path.join(claudeDir, f)); } catch {}
    }
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
    // Per-user .claude dir (writable — session data, credentials)
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
  getContainerName,
  getSandboxDir,
  isDockerAvailable,
  isBwrapAvailable,
  ensureContainer,
  spawnInContainer,
  spawnInBwrap,
  removeContainer,
  getSandboxStatus,
  cleanWorkspace,
  markContainerUsed,
  checkDiskUsage,
  reapIdleContainers,
  ensureSandboxDirs,
  init,
  shutdown,
};
