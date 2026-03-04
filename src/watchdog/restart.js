'use strict';

const fs = require('fs');
const { execFileSync, execFile, spawn } = require('child_process');
const config = require('./config');

// ── Circuit breaker state ──
const restartTimestamps = [];
let circuitOpen = false;
let circuitOpenedAt = 0;

/**
 * Check if circuit breaker is tripped.
 */
function isCircuitOpen() {
  if (!circuitOpen) return false;

  // Auto-reset after cooldown
  if (Date.now() - circuitOpenedAt >= config.circuitBreaker.cooldownMs) {
    circuitOpen = false;
    restartTimestamps.length = 0;
    return false;
  }

  // Manual reset via file
  if (fs.existsSync(config.resetFile)) {
    try { fs.unlinkSync(config.resetFile); } catch { /* ignore */ }
    circuitOpen = false;
    restartTimestamps.length = 0;
    return false;
  }

  return true;
}

/**
 * Record a restart and check if circuit should trip.
 * @returns {boolean} true if circuit just tripped
 */
function recordRestart() {
  const now = Date.now();
  restartTimestamps.push(now);

  // Remove old timestamps outside window
  while (restartTimestamps.length > 0 &&
    now - restartTimestamps[0] > config.circuitBreaker.windowMs) {
    restartTimestamps.shift();
  }

  if (restartTimestamps.length >= config.circuitBreaker.maxRestarts) {
    circuitOpen = true;
    circuitOpenedAt = now;
    return true;
  }
  return false;
}

/**
 * Kill the existing bot process.
 */
function killExisting() {
  // Try PID file first
  try {
    const pid = parseInt(fs.readFileSync(config.pidFile, 'utf8').trim(), 10);
    if (!isNaN(pid) && pid > 0) {
      try {
        process.kill(pid, 'SIGTERM');
        // Wait for graceful shutdown
        const deadline = Date.now() + config.shutdownWaitMs;
        while (Date.now() < deadline) {
          try {
            process.kill(pid, 0);
            // Still alive, wait
            execFileSync('sleep', ['0.5']);
          } catch {
            break; // Process gone
          }
        }
        // Force kill if still alive
        try { process.kill(pid, 'SIGKILL'); } catch { /* already dead */ }
      } catch { /* process already gone */ }
    }
  } catch { /* no PID file */ }

  // Clean up ports with fuser
  for (const port of [config.webhookPort, config.apiPort]) {
    try {
      execFileSync('fuser', ['-k', `${port}/tcp`], { timeout: 5_000 });
    } catch { /* port not in use or fuser not available */ }
  }

  // Remove stale PID file
  try { fs.unlinkSync(config.pidFile); } catch { /* ignore */ }
}

/**
 * Pre-flight checks before starting.
 * @returns {{ ok: boolean, reason?: string }}
 */
function preflight() {
  if (!fs.existsSync(config.nodeBinary)) {
    return { ok: false, reason: `Node binary not found: ${config.nodeBinary}` };
  }
  if (!fs.existsSync(config.botEntry)) {
    return { ok: false, reason: `Bot entry not found: ${config.botEntry}` };
  }
  const envFile = require('path').join(config.botDir, '.env');
  if (!fs.existsSync(envFile)) {
    return { ok: false, reason: `.env file not found: ${envFile}` };
  }
  return { ok: true };
}

/**
 * Start the bot process.
 * Tries systemd first, falls back to direct spawn.
 * @returns {{ success: boolean, method: string, reason?: string }}
 */
function startBot() {
  // Try systemd first
  try {
    execFileSync('systemctl', ['is-enabled', 'ai-assistant-bot'], { timeout: 5_000 });
    execFileSync('systemctl', ['start', 'ai-assistant-bot'], { timeout: 15_000 });
    return { success: true, method: 'systemd' };
  } catch { /* systemd not available or service not installed */ }

  // Direct spawn fallback
  const logFd = fs.openSync(config.botLogFile, 'a');
  const child = spawn(config.nodeBinary, [config.botEntry], {
    cwd: config.botDir,
    env: { ...process.env, NODE_ENV: 'production' },
    detached: true,
    stdio: ['ignore', logFd, logFd],
  });
  child.unref();
  fs.closeSync(logFd);

  return { success: true, method: 'direct', pid: child.pid };
}

/**
 * Verify the bot started successfully by checking ports.
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
function verifyStarted() {
  return new Promise((resolve) => {
    setTimeout(() => {
      const net = require('net');
      const socket = new net.Socket();
      socket.connect(config.webhookPort, '127.0.0.1', () => {
        socket.destroy();
        resolve({ ok: true });
      });
      socket.on('error', (err) => {
        socket.destroy();
        resolve({ ok: false, reason: `Port ${config.webhookPort} not listening: ${err.message}` });
      });
      socket.setTimeout(3_000, () => {
        socket.destroy();
        resolve({ ok: false, reason: 'Port check timeout' });
      });
    }, config.postStartWaitMs);
  });
}

/**
 * Full restart sequence.
 * @returns {Promise<{ success: boolean, method?: string, circuitTripped?: boolean, reason?: string }>}
 */
async function restart() {
  if (isCircuitOpen()) {
    return { success: false, reason: 'Circuit breaker is open', circuitTripped: true };
  }

  const check = preflight();
  if (!check.ok) {
    return { success: false, reason: check.reason };
  }

  killExisting();

  const result = startBot();
  if (!result.success) {
    return { success: false, reason: result.reason || 'Failed to start bot' };
  }

  const verify = await verifyStarted();

  const tripped = recordRestart();

  return {
    success: verify.ok,
    method: result.method,
    circuitTripped: tripped,
    reason: verify.ok ? undefined : verify.reason,
  };
}

// Exported for testing
function _resetState() {
  restartTimestamps.length = 0;
  circuitOpen = false;
  circuitOpenedAt = 0;
}

module.exports = { restart, isCircuitOpen, recordRestart, killExisting, preflight, startBot, verifyStarted, _resetState };
