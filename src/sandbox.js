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
    return containerName;
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
      // Read-only credential overlay
      '-v', `${CREDENTIALS_PATH}:/home/claude/.claude/.credentials.json:ro`,
      // Working directory
      '-w', '/workspace',
      // Resource limits
      '--memory', config.sandboxMemory,
      '--cpus', config.sandboxCpus,
      '--pids-limit', config.sandboxPidsLimit,
      // Tmpfs for /tmp — prevents overlay bloat from temp files
      '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m',
      // Security
      '--security-opt', 'no-new-privileges',
      IMAGE_NAME,
    ];

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
 */
async function spawnInContainer(chatId, args, env) {
  const containerName = await ensureContainer(chatId);

  // Build docker exec args with env vars
  const dockerArgs = ['exec'];

  // Pass through environment variables
  if (env) {
    for (const [key, val] of Object.entries(env)) {
      if (val !== undefined && val !== null) {
        dockerArgs.push('-e', `${key}=${val}`);
      }
    }
  }

  dockerArgs.push(containerName, 'claude', ...args);

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

module.exports = {
  hashChatId,
  getContainerName,
  getSandboxDir,
  isDockerAvailable,
  ensureContainer,
  spawnInContainer,
  removeContainer,
  getSandboxStatus,
  cleanWorkspace,
  markContainerUsed,
  checkDiskUsage,
  reapIdleContainers,
  init,
  shutdown,
};
