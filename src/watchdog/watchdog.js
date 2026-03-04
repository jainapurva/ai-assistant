#!/usr/bin/env node
'use strict';

/**
 * AI Assistant Watchdog — Main Loop
 *
 * Zero npm dependencies. Uses only Node.js builtins.
 * Does NOT import any bot code — completely independent process.
 *
 * Usage: node src/watchdog/watchdog.js
 */

const fs = require('fs');
const config = require('./config');
const checks = require('./checks');
const { alert, alertResolved } = require('./alerter');
const { restart, isCircuitOpen } = require('./restart');
const { attemptFix: fixClaudeAuth } = require('./claude-auth');
const { diagnose } = require('./diagnostics');

// ── Failure counters ──
const failureCounts = {
  processAlive: 0,
  webhookPort: 0,
  apiHealth: 0,
  claudeAuth: 0,
  stuckTasks: 0,
};

// Track which checks were previously failing (for resolution alerts)
const previouslyFailing = new Set();

let running = true;
let checkCount = 0;

function log(level, msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level.toUpperCase()}] ${msg}`;
  // Write to stderr (captured by systemd journal)
  process.stderr.write(line + '\n');
  // Append to log file
  try {
    fs.appendFileSync(config.watchdogLogFile, line + '\n');
  } catch { /* ignore write errors */ }
}

/**
 * Run all health checks and take action on failures.
 */
async function runChecks() {
  checkCount++;
  log('info', `Health check #${checkCount}`);

  // ── Check 1: Process alive ──
  const proc = checks.checkProcessAlive();
  if (!proc.ok) {
    failureCounts.processAlive++;
    log('warn', `Process check failed (${failureCounts.processAlive}/${config.thresholds.processAlive}): ${proc.reason}`);

    if (failureCounts.processAlive >= config.thresholds.processAlive) {
      await handleFailure('process_dead', `Bot process is dead: ${proc.reason}`);
    }
  } else {
    if (previouslyFailing.has('process_dead')) {
      await alertResolved('process_dead', `Bot process is running again (PID ${proc.pid})`);
      previouslyFailing.delete('process_dead');
    }
    failureCounts.processAlive = 0;
  }

  // ── Check 2: Webhook port ──
  const webhook = await checks.checkWebhookPort();
  if (!webhook.ok) {
    failureCounts.webhookPort++;
    log('warn', `Webhook port check failed (${failureCounts.webhookPort}/${config.thresholds.webhookPort}): ${webhook.reason}`);

    if (failureCounts.webhookPort >= config.thresholds.webhookPort) {
      await handleFailure('webhook_down', `Webhook port not responding: ${webhook.reason}`);
    }
  } else {
    if (previouslyFailing.has('webhook_down')) {
      await alertResolved('webhook_down', 'Webhook port is responding again');
      previouslyFailing.delete('webhook_down');
    }
    failureCounts.webhookPort = 0;
  }

  // ── Check 3: API health ──
  const api = await checks.checkApiHealth();
  if (!api.ok) {
    failureCounts.apiHealth++;
    log('warn', `API health check failed (${failureCounts.apiHealth}/${config.thresholds.apiHealth}): ${api.reason}`);

    if (failureCounts.apiHealth >= config.thresholds.apiHealth) {
      await handleFailure('api_unhealthy', `API health check failed: ${api.reason}`);
    }
  } else {
    if (previouslyFailing.has('api_unhealthy')) {
      await alertResolved('api_unhealthy', 'API health check passing again');
      previouslyFailing.delete('api_unhealthy');
    }
    failureCounts.apiHealth = 0;
  }

  // ── Check 4: Claude auth ──
  const auth = checks.checkClaudeAuth();
  if (!auth.ok && !auth.warning) {
    failureCounts.claudeAuth++;
    log('warn', `Claude auth check failed: ${auth.reason}`);

    if (failureCounts.claudeAuth >= config.thresholds.claudeAuth) {
      await handleClaudeAuth(auth.reason);
    }
  } else {
    if (auth.warning) {
      log('warn', `Claude auth warning: ${auth.reason}`);
    }
    if (previouslyFailing.has('claude_auth')) {
      await alertResolved('claude_auth', 'Claude authentication is valid again');
      previouslyFailing.delete('claude_auth');
    }
    failureCounts.claudeAuth = 0;
  }

  // ── Check 5: Stale sandbox credentials ──
  const sandboxCreds = checks.checkStaleSandboxCredentials();
  if (!sandboxCreds.ok) {
    log('warn', `Sandbox credential fix: ${sandboxCreds.reason}`);
  }

  // ── Check 6: Stuck tasks ──
  const stuck = checks.checkStuckTasks();
  if (!stuck.ok) {
    failureCounts.stuckTasks++;
    log('warn', `Stuck tasks detected (${failureCounts.stuckTasks}/${config.thresholds.stuckTasks}): ${stuck.reason}`);

    if (failureCounts.stuckTasks >= config.thresholds.stuckTasks) {
      const details = stuck.stuck ? stuck.stuck.map(s => `  - ${s.chatId} (${s.ageMin} min)`).join('\n') : '';
      await alert('stuck_tasks', `${stuck.reason}\n${details}`);
      previouslyFailing.add('stuck_tasks');
    }
  } else {
    if (previouslyFailing.has('stuck_tasks')) {
      await alertResolved('stuck_tasks', 'No more stuck tasks');
      previouslyFailing.delete('stuck_tasks');
    }
    failureCounts.stuckTasks = 0;
  }
}

/**
 * Handle a critical failure: alert + restart.
 */
async function handleFailure(issueType, message) {
  previouslyFailing.add(issueType);

  if (isCircuitOpen()) {
    log('error', `Circuit breaker is open — not restarting. Issue: ${issueType}`);
    const diagnosis = await diagnose(`Circuit breaker tripped. ${message}`);
    await alert(issueType, `${message}\n\nCircuit breaker is OPEN (too many restarts).\nAuto-reset in ${config.circuitBreaker.cooldownMs / 60_000} min.\nManual reset: touch ${config.resetFile}\n\nDiagnosis:\n${diagnosis}`, { force: true });
    return;
  }

  log('info', `Attempting restart for: ${issueType}`);
  await alert(issueType, `${message}\n\nAttempting automatic restart...`);

  const result = await restart();

  if (result.success) {
    log('info', `Restart successful via ${result.method}`);
    // Reset failure counters on successful restart
    failureCounts.processAlive = 0;
    failureCounts.webhookPort = 0;
    failureCounts.apiHealth = 0;
    await alertResolved(issueType, `Bot restarted successfully via ${result.method}`);
    previouslyFailing.delete(issueType);
  } else {
    log('error', `Restart failed: ${result.reason}`);

    if (result.circuitTripped) {
      const diagnosis = await diagnose(`Restart failed, circuit breaker tripped. ${message}. Restart error: ${result.reason}`);
      await alert(issueType, `Restart failed — circuit breaker TRIPPED.\n\nReason: ${result.reason}\n\nDiagnosis:\n${diagnosis}`, { force: true });
    } else {
      await alert(issueType, `Restart failed: ${result.reason}`);
    }
  }
}

/**
 * Handle Claude auth failure: try auto-fix, then alert.
 */
async function handleClaudeAuth(reason) {
  previouslyFailing.add('claude_auth');
  log('info', 'Attempting Claude auth fix...');

  const fix = await fixClaudeAuth();

  if (fix.fixed) {
    log('info', 'Claude auth fixed');
    await alertResolved('claude_auth', fix.message);
    previouslyFailing.delete('claude_auth');
    failureCounts.claudeAuth = 0;
  } else {
    log('error', `Claude auth fix failed: ${fix.message}`);
    const diagnosis = await diagnose(`Claude authentication failure: ${reason}. Auto-fix failed: ${fix.message}`);
    await alert('claude_auth', `Claude auth expired: ${reason}\n\nAuto-fix failed.\n${fix.message}\n\nDiagnosis:\n${diagnosis}`);
  }
}

/**
 * Main loop.
 */
async function main() {
  log('info', 'Watchdog starting');
  log('info', `Check interval: ${config.checkIntervalMs / 1000}s`);
  log('info', `PID file: ${config.pidFile}`);
  log('info', `Webhook port: ${config.webhookPort}, API port: ${config.apiPort}`);

  // Run first check immediately
  await runChecks();

  // Schedule recurring checks
  const interval = setInterval(async () => {
    if (!running) return;
    try {
      await runChecks();
    } catch (err) {
      log('error', `Check loop error: ${err.message}`);
    }
  }, config.checkIntervalMs);

  // Graceful shutdown
  const shutdown = () => {
    log('info', 'Watchdog shutting down');
    running = false;
    clearInterval(interval);
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Keep alive
  process.on('uncaughtException', (err) => {
    log('error', `Uncaught exception: ${err.message}`);
  });
  process.on('unhandledRejection', (reason) => {
    log('error', `Unhandled rejection: ${reason?.message || reason}`);
  });
}

// ── Entry point ──
if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`Watchdog fatal error: ${err.message}\n`);
    process.exit(1);
  });
}

module.exports = { runChecks, handleFailure, handleClaudeAuth, main };
