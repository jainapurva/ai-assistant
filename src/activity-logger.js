const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ACTIVITY_DIR = '/media/ddarji/storage/ai-assistant/activity';

// Ensure activity directory exists on module load
fs.mkdirSync(ACTIVITY_DIR, { recursive: true });

/**
 * Get the hash-based directory name for a user (same scheme as sandbox dirs).
 */
function userHash(chatId) {
  return crypto.createHash('sha256').update(chatId).digest('hex').slice(0, 12);
}

/**
 * Get the per-user activity directory. Created on first use.
 */
function getUserDir(chatId) {
  const dir = path.join(ACTIVITY_DIR, userHash(chatId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Get the log file for a user+agent combination.
 * Structure: activity/{user_hash}/{agentId}.jsonl
 */
function getLogFile(chatId, agentId = 'general') {
  const dir = getUserDir(chatId);
  return path.join(dir, `${agentId}.jsonl`);
}

/**
 * Append a structured event to the agent-specific log file.
 * If event.agentId is set, it's used for file routing; otherwise defaults to 'general'.
 */
function logEvent(chatId, event) {
  const agentId = event.agentId || 'general';
  const entry = {
    ts: new Date().toISOString(),
    chatId,
    agentId,
    ...event,
  };
  try {
    fs.appendFileSync(getLogFile(chatId, agentId), JSON.stringify(entry) + '\n');
  } catch (e) {
    // Silently fail — logging should never break the bot
  }
}

// ── Event helpers ──────────────────────────────────────────────────────────

function logMessageIn(chatId, { senderId, senderName, type, content, mediaType, isGroup }) {
  logEvent(chatId, {
    event: 'message_in',
    senderId,
    senderName,
    type: type || 'text',
    content,
    mediaType: mediaType || null,
    isGroup: !!isGroup,
  });
}

function logMessageOut(chatId, { content, chunks, trigger }) {
  logEvent(chatId, {
    event: 'message_out',
    content: content ? content.slice(0, 10000) : null,
    contentLength: content ? content.length : 0,
    chunks: chunks || 1,
    trigger: trigger || 'claude',
  });
}

function logCommand(chatId, { command, args, senderId }) {
  logEvent(chatId, {
    event: 'command',
    command,
    args: args || null,
    senderId,
  });
}

function logTaskStart(chatId, { model, sessionId, project, promptPreview, sandbox }) {
  logEvent(chatId, {
    event: 'task_start',
    model,
    sessionId: sessionId || null,
    project: project || null,
    promptPreview: promptPreview ? promptPreview.slice(0, 200) : null,
    sandbox: sandbox || 'none',
  });
}

function logTaskEnd(chatId, { status, durationSecs, tokens, model, exitCode, error }) {
  logEvent(chatId, {
    event: 'task_end',
    status,
    durationSecs,
    tokens: tokens || null,
    model,
    exitCode: exitCode != null ? exitCode : null,
    error: error ? error.slice(0, 500) : null,
  });
}

function logSession(chatId, { action, sessionId }) {
  logEvent(chatId, {
    event: 'session',
    action,
    sessionId: sessionId || null,
  });
}

function logMediaOut(chatId, { filename, sizeBytes, type, destination }) {
  logEvent(chatId, {
    event: 'media_out',
    filename,
    sizeBytes,
    type: type || 'file',
    destination: destination || 'whatsapp',
  });
}

function logError(chatId, { error, context }) {
  logEvent(chatId, {
    event: 'error',
    error: error ? error.slice(0, 500) : 'unknown',
    context: context || null,
  });
}

// ── Query helpers ──────────────────────────────────────────────────────────

/**
 * Read activity events for a user.
 * @param {string} chatId
 * @param {object} [opts] - { since, until, eventTypes, limit, agentId }
 *   agentId: if set, only read that agent's log file; otherwise read all agents
 * @returns {Array} Parsed event objects
 */
function getActivity(chatId, opts = {}) {
  const dir = path.join(ACTIVITY_DIR, userHash(chatId));
  if (!fs.existsSync(dir)) return [];

  // If agentId specified, read only that agent's file; otherwise read all
  let files;
  if (opts.agentId) {
    const agentFile = `${opts.agentId}.jsonl`;
    files = fs.existsSync(path.join(dir, agentFile)) ? [agentFile] : [];
  } else {
    files = fs.readdirSync(dir)
      .filter(f => f.endsWith('.jsonl'))
      .sort();
  }

  let events = [];
  for (const file of files) {
    const content = fs.readFileSync(path.join(dir, file), 'utf8').trim();
    if (!content) continue;
    for (const line of content.split('\n')) {
      try {
        const evt = JSON.parse(line);
        if (opts.since && evt.ts < opts.since) continue;
        if (opts.until && evt.ts > opts.until) continue;
        if (opts.eventTypes && !opts.eventTypes.includes(evt.event)) continue;
        events.push(evt);
      } catch (e) {}
    }
  }

  if (opts.limit) {
    events = events.slice(-opts.limit);
  }

  return events;
}

/**
 * Get usage summary for a user across all sessions.
 */
function getUsageSummary(chatId, since) {
  const events = getActivity(chatId, { since });

  const summary = {
    totalMessages: 0,
    totalResponses: 0,
    totalCommands: 0,
    totalTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    stoppedTasks: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheCreationTokens: 0,
    totalCacheReadTokens: 0,
    totalCostUsd: 0,
    totalDurationSecs: 0,
    totalSessionSecs: 0,
    totalErrors: 0,
    totalMediaSent: 0,
    totalSessions: 0,
    firstActivity: null,
    lastActivity: null,
  };

  const dailySessions = {};

  for (const evt of events) {
    if (!summary.firstActivity) summary.firstActivity = evt.ts;
    summary.lastActivity = evt.ts;

    if (evt.event === 'message_in') {
      const day = evt.ts.slice(0, 10);
      const ms = new Date(evt.ts).getTime();
      if (!dailySessions[day]) {
        dailySessions[day] = { first: ms, last: ms };
      } else {
        dailySessions[day].last = ms;
      }
    }

    switch (evt.event) {
      case 'message_in':
        summary.totalMessages++;
        break;
      case 'message_out':
        summary.totalResponses++;
        break;
      case 'command':
        summary.totalCommands++;
        break;
      case 'task_end':
        summary.totalTasks++;
        if (evt.status === 'completed') summary.completedTasks++;
        else if (evt.status === 'error') summary.failedTasks++;
        else if (evt.status === 'stopped') summary.stoppedTasks++;
        if (evt.tokens) {
          summary.totalInputTokens += evt.tokens.input || 0;
          summary.totalOutputTokens += evt.tokens.output || 0;
          summary.totalCacheCreationTokens += evt.tokens.cacheCreation || 0;
          summary.totalCacheReadTokens += evt.tokens.cacheRead || 0;
          summary.totalCostUsd += evt.tokens.costUsd || 0;
        }
        summary.totalDurationSecs += evt.durationSecs || 0;
        break;
      case 'session':
        if (evt.action === 'create') summary.totalSessions++;
        break;
      case 'error':
        summary.totalErrors++;
        break;
      case 'media_out':
        summary.totalMediaSent++;
        break;
    }
  }

  for (const day of Object.values(dailySessions)) {
    summary.totalSessionSecs += Math.round((day.last - day.first) / 1000);
  }

  return summary;
}

/**
 * List all users that have activity logs.
 * @returns {Array<string>} Array of user hash directory names
 */
function listUsers() {
  try {
    return fs.readdirSync(ACTIVITY_DIR)
      .filter(f => {
        const fullPath = path.join(ACTIVITY_DIR, f);
        return fs.statSync(fullPath).isDirectory();
      });
  } catch {
    return [];
  }
}

// ── Database sync ──────────────────────────────────────────────────────────

const ANALYTICS_API_URL = 'https://swayat.com/api/user/analytics';

/**
 * Send incremental analytics delta to the DB (fire-and-forget).
 */
function syncToDb(chatId, delta) {
  if (!delta || Object.keys(delta).length === 0) return;

  const phone = '+' + chatId.replace('@c.us', '').replace('@g.us', '');
  const payload = { phone, activityLogHash: userHash(chatId), ...delta };

  fetch(ANALYTICS_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

// ── Migration: move legacy files into per-agent structure ──────────────

(function migrateOldFiles() {
  try {
    // Phase 1: move top-level {hash}.jsonl into {hash}/general.jsonl
    const topFiles = fs.readdirSync(ACTIVITY_DIR).filter(f => f.endsWith('.jsonl'));
    for (const file of topFiles) {
      const hash = file.replace('.jsonl', '');
      const oldPath = path.join(ACTIVITY_DIR, file);
      if (!fs.statSync(oldPath).isFile()) continue;
      const newDir = path.join(ACTIVITY_DIR, hash);
      fs.mkdirSync(newDir, { recursive: true });
      fs.renameSync(oldPath, path.join(newDir, 'general.jsonl'));
    }

    // Phase 2: rename conversation.jsonl → general.jsonl (pre-agent data is "general")
    const dirs = fs.readdirSync(ACTIVITY_DIR).filter(f => {
      return fs.statSync(path.join(ACTIVITY_DIR, f)).isDirectory();
    });
    for (const dir of dirs) {
      const userDir = path.join(ACTIVITY_DIR, dir);
      const convPath = path.join(userDir, 'conversation.jsonl');
      const generalPath = path.join(userDir, 'general.jsonl');
      if (fs.existsSync(convPath)) {
        if (fs.existsSync(generalPath)) {
          // Append conversation.jsonl content to general.jsonl
          const content = fs.readFileSync(convPath, 'utf8');
          if (content.trim()) {
            fs.appendFileSync(generalPath, content.endsWith('\n') ? content : content + '\n');
          }
          fs.unlinkSync(convPath);
        } else {
          fs.renameSync(convPath, generalPath);
        }
      }
    }
  } catch (e) {
    // Migration is best-effort
  }
})();

module.exports = {
  logMessageIn,
  logMessageOut,
  logCommand,
  logTaskStart,
  logTaskEnd,
  logSession,
  logMediaOut,
  logError,
  getActivity,
  getUsageSummary,
  listUsers,
  userHash,
  syncToDb,
  ACTIVITY_DIR,
};
