'use strict';

const fs = require('fs');
const net = require('net');
const http = require('http');
const { execFileSync } = require('child_process');
const config = require('./config');

/**
 * Check 1: Process alive via PID file + kill(pid, 0)
 */
function checkProcessAlive() {
  try {
    const pidStr = fs.readFileSync(config.pidFile, 'utf8').trim();
    const pid = parseInt(pidStr, 10);
    if (isNaN(pid) || pid <= 0) return { ok: false, reason: 'Invalid PID file' };

    process.kill(pid, 0); // Throws if process doesn't exist
    return { ok: true, pid };
  } catch (err) {
    if (err.code === 'ENOENT') return { ok: false, reason: 'PID file not found' };
    if (err.code === 'ESRCH') return { ok: false, reason: 'Process not running (stale PID)' };
    if (err.code === 'EPERM') return { ok: true, reason: 'Process exists (no permission to signal)' };
    return { ok: false, reason: err.message };
  }
}

/**
 * Check 2: TCP connect to webhook port
 */
function checkWebhookPort() {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timer = setTimeout(() => {
      socket.destroy();
      resolve({ ok: false, reason: `TCP connect timeout (${config.tcpTimeoutMs}ms)` });
    }, config.tcpTimeoutMs);

    socket.connect(config.webhookPort, '127.0.0.1', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve({ ok: true });
    });

    socket.on('error', (err) => {
      clearTimeout(timer);
      socket.destroy();
      resolve({ ok: false, reason: `Port ${config.webhookPort}: ${err.message}` });
    });
  });
}

/**
 * Check 3: HTTP GET /health on API port
 */
function checkApiHealth() {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({ ok: false, reason: `HTTP health timeout (${config.httpTimeoutMs}ms)` });
    }, config.httpTimeoutMs);

    const req = http.get({
      hostname: '127.0.0.1',
      port: config.apiPort,
      path: '/health',
      timeout: config.httpTimeoutMs,
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        clearTimeout(timer);
        if (res.statusCode === 200) {
          try {
            const data = JSON.parse(body);
            resolve({ ok: data.status === 'ok', data });
          } catch {
            resolve({ ok: false, reason: 'Invalid JSON from /health' });
          }
        } else {
          resolve({ ok: false, reason: `HTTP ${res.statusCode}` });
        }
      });
    });

    req.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, reason: err.message });
    });

    req.on('timeout', () => {
      req.destroy();
      clearTimeout(timer);
      resolve({ ok: false, reason: 'Request timeout' });
    });
  });
}

/**
 * Check 4: Claude CLI credentials expiry
 */
function checkClaudeAuth() {
  try {
    if (!fs.existsSync(config.credentialsFile)) {
      return { ok: false, reason: 'Credentials file not found' };
    }
    const creds = JSON.parse(fs.readFileSync(config.credentialsFile, 'utf8'));

    // Handle both single-object and keyed formats
    const entries = Array.isArray(creds) ? creds
      : typeof creds === 'object' && creds.expiresAt ? [creds]
      : Object.values(creds);

    for (const entry of entries) {
      if (!entry || !entry.expiresAt) continue;
      const expiresAt = new Date(entry.expiresAt).getTime();
      const now = Date.now();
      const remainingMin = Math.round((expiresAt - now) / 60_000);

      if (expiresAt <= now) {
        return { ok: false, reason: `Claude token expired ${-remainingMin} min ago` };
      }
      if (remainingMin < 30) {
        return { ok: false, reason: `Claude token expires in ${remainingMin} min`, warning: true };
      }
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: `Credentials check error: ${err.message}` };
  }
}

/**
 * Check 5: Stuck tasks (pending > 30 min)
 */
function checkStuckTasks() {
  try {
    if (!fs.existsSync(config.stateFile)) {
      return { ok: true, reason: 'No state file' };
    }
    const state = JSON.parse(fs.readFileSync(config.stateFile, 'utf8'));
    const pending = state.pendingTasks;
    if (!pending || typeof pending !== 'object') return { ok: true };

    const now = Date.now();
    const stuck = [];
    for (const [chatId, task] of Object.entries(pending)) {
      const age = now - (task.queuedAt || task.startedAt || 0);
      if (age > config.stuckTaskAgeMs) {
        stuck.push({ chatId: chatId.slice(0, 8) + '...', ageMin: Math.round(age / 60_000) });
      }
    }

    if (stuck.length > 0) {
      return { ok: false, reason: `${stuck.length} stuck task(s)`, stuck };
    }
    return { ok: true };
  } catch (err) {
    return { ok: true, reason: `State read error: ${err.message}` };
  }
}

module.exports = {
  checkProcessAlive,
  checkWebhookPort,
  checkApiHealth,
  checkClaudeAuth,
  checkStuckTasks,
};
