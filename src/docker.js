/**
 * Docker sandbox module — manages one persistent container per WhatsApp group.
 *
 * Each group gets:
 *   <sandboxBase>/<groupId>/workspace/  → /workspace  (Claude's cwd)
 *   <sandboxBase>/<groupId>/.claude/    → /root/.claude (sessions + auth)
 *
 * The Claude binary is mounted read-only from the host.
 * Admin DM chats bypass Docker entirely and run Claude on the host.
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./logger');

const CONTAINER_IMAGE = 'whatsapp-bot-sandbox:latest';

// Resolve the real claude binary path (follow symlinks — Docker needs the actual file)
let CLAUDE_BINARY_REAL;
try {
  CLAUDE_BINARY_REAL = execSync(`readlink -f "${config.claudePath}"`, { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString().trim();
} catch (e) {
  CLAUDE_BINARY_REAL = config.claudePath;
}

// Credentials file on host — seeded into each group's .claude dir on first run
const HOST_CREDENTIALS = path.join(process.env.HOME || '/root', '.claude', '.credentials.json');

// In-flight creation tracker — prevents double-create if two messages arrive simultaneously
const creating = new Set();

function getContainerName(chatId) {
  // Docker container names: only alphanumeric, hyphens, underscores
  return 'whatsapp-bot-' + chatId.replace(/[^a-zA-Z0-9_-]/g, '-');
}

function getSandboxDir(chatId) {
  return path.join(config.sandboxDir, chatId);
}

/**
 * Ensures the container for a group exists and is running.
 * Creates it on first call, restarts it if stopped.
 * Returns the container name.
 */
async function ensureGroupContainer(chatId) {
  // Serialize creation per group to avoid races
  while (creating.has(chatId)) {
    await new Promise(r => setTimeout(r, 100));
  }

  const name = getContainerName(chatId);
  const sandboxDir = getSandboxDir(chatId);
  const workspaceDir = path.join(sandboxDir, 'workspace');
  const claudeDir = path.join(sandboxDir, '.claude');

  // Create host dirs
  fs.mkdirSync(workspaceDir, { recursive: true });
  fs.mkdirSync(claudeDir, { recursive: true });

  // Seed credentials from host if not already present
  const credsDest = path.join(claudeDir, '.credentials.json');
  if (!fs.existsSync(credsDest) && fs.existsSync(HOST_CREDENTIALS)) {
    fs.copyFileSync(HOST_CREDENTIALS, credsDest);
    logger.info(`docker: seeded credentials for group ${chatId}`);
  }

  // Check current container state
  let status = null;
  try {
    status = execSync(`docker inspect --format='{{.State.Status}}' ${name}`, {
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim().replace(/'/g, '');
  } catch (_) {
    // Container doesn't exist yet
  }

  if (status === 'running') return name;

  if (status === 'exited' || status === 'created') {
    execSync(`docker start ${name}`, { stdio: 'ignore' });
    logger.info(`docker: restarted container ${name}`);
    return name;
  }

  // Create new container
  creating.add(chatId);
  try {
    const args = [
      'docker', 'run', '-d',
      '--name', name,
      '--restart', 'unless-stopped',
      // Mount claude binary read-only from host
      '-v', `${CLAUDE_BINARY_REAL}:/usr/local/bin/claude:ro`,
      // Mount group workspace as Claude's working directory
      '-v', `${workspaceDir}:/workspace`,
      // Mount group .claude dir for session persistence and auth
      '-v', `${claudeDir}:/root/.claude`,
      '-w', '/workspace',
      // Resource limits
      '--memory', '1g',
      '--cpus', '1',
      CONTAINER_IMAGE,
    ];
    execSync(args.join(' '), { stdio: 'ignore' });
    logger.info(`docker: created container ${name} for group ${chatId}`);
  } catch (e) {
    // Handle race where another call created it first
    if (e.message && e.message.includes('already in use')) {
      logger.info(`docker: container ${name} already exists (race), continuing`);
    } else {
      throw e;
    }
  } finally {
    creating.delete(chatId);
  }

  return name;
}

/**
 * Spawns a Claude process inside the group's container.
 * Returns a ChildProcess compatible with the host spawn() result.
 */
async function spawnInContainer(chatId, args, env) {
  const name = await ensureGroupContainer(chatId);

  const dockerArgs = ['exec', '-i', '-w', '/workspace'];

  // Forward whitelisted env vars into the container
  for (const [key, val] of Object.entries(env)) {
    dockerArgs.push('-e', `${key}=${val}`);
  }

  dockerArgs.push(name, '/usr/local/bin/claude', ...args);

  logger.info(`docker: exec in ${name}: claude ${args.slice(0, -1).join(' ')} "<prompt>"`);

  return spawn('docker', dockerArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/**
 * Removes a group's container (e.g. on /reset).
 * Sandbox files are kept — only the container is removed.
 */
function removeGroupContainer(chatId) {
  const name = getContainerName(chatId);
  try {
    execSync(`docker rm -f ${name}`, { stdio: 'ignore' });
    logger.info(`docker: removed container ${name}`);
  } catch (e) {
    logger.warn(`docker: could not remove container ${name}: ${e.message}`);
  }
}

module.exports = { spawnInContainer, ensureGroupContainer, removeGroupContainer, getSandboxDir, getContainerName };
