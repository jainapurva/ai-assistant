const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { runClaude, STATE_FILE } = require('./claude');
const logger = require('./logger');

// Active cron jobs: id -> cron.ScheduledTask
const activeJobs = new Map();

// Provider reference (set via init)
let waProvider = null;

// Callback for sending messages (set via init) — allows index.js to track sent IDs
let sendMessageFn = null;

// Friendly interval to cron expression mapping
const INTERVAL_MAP = {
  m: (n) => `*/${n} * * * *`,
  h: (n) => `0 */${n} * * *`,
  d: (n) => `0 0 */${n} * *`,
};

function parseFriendlyInterval(str) {
  const match = str.match(/^every\s+(\d+)\s*(m|min|mins|h|hr|hrs|hour|hours|d|day|days)$/i);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  const unit = match[2].charAt(0).toLowerCase();
  const cronFn = INTERVAL_MAP[unit];
  if (!cronFn || num < 1) return null;
  return { cron: cronFn(num), friendly: `every ${num}${unit}` };
}

function generateId() {
  return 'sched_' + Math.random().toString(36).slice(2, 10);
}

// --- State persistence (all tasks in local STATE_FILE) ---
function loadScheduledTasks() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      return data.scheduledTasks || [];
    }
  } catch (e) {}
  return [];
}

function saveScheduledTask(task) {
  try {
    let data = {};
    if (fs.existsSync(STATE_FILE)) data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (!data.scheduledTasks) data.scheduledTasks = [];
    data.scheduledTasks.push(task);
    fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    logger.warn('Failed to save scheduled task:', e.message);
  }
}

function removeScheduledTask(taskId) {
  try {
    if (!fs.existsSync(STATE_FILE)) return;
    const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (!data.scheduledTasks) return;
    data.scheduledTasks = data.scheduledTasks.filter(t => t.id !== taskId);
    fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    logger.warn('Failed to remove scheduled task:', e.message);
  }
}

function removeAllScheduledTasks(chatId) {
  try {
    if (!fs.existsSync(STATE_FILE)) return;
    const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (!data.scheduledTasks) return;
    data.scheduledTasks = data.scheduledTasks.filter(t => t.chatId !== chatId);
    fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    logger.warn('Failed to remove scheduled tasks:', e.message);
  }
}

function updateTaskLastRun(taskId, status) {
  try {
    if (!fs.existsSync(STATE_FILE)) return;
    const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (!data.scheduledTasks) return;
    const task = data.scheduledTasks.find(t => t.id === taskId);
    if (task) { task.lastRun = Date.now(); task.lastStatus = status; }
    fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
  } catch (e) {}
}

// --- Cron job management ---
function registerJob(task) {
  if (activeJobs.has(task.id)) return;
  if (!cron.validate(task.cron)) {
    logger.warn(`Invalid cron expression for task ${task.id}: ${task.cron}`);
    return;
  }

  const send = async (chatId, text) => {
    if (sendMessageFn) {
      await sendMessageFn(chatId, text);
    } else {
      await waProvider.sendMessage(chatId, text);
    }
  };

  const job = cron.schedule(task.cron, async () => {
    if (!waProvider) return;
    // Check provider connectivity before running Claude
    try {
      const state = await waProvider.getState();
      if (state !== 'CONNECTED') {
        logger.warn(`Scheduled task ${task.id} skipped: provider not connected (state: ${state})`);
        return;
      }
    } catch (e) {
      logger.warn(`Scheduled task ${task.id} skipped: could not get provider state: ${e.message}`);
      return;
    }
    logger.info(`Scheduled ${task.type || 'task'} ${task.id} executing: "${task.prompt}"`);
    try {
      const prefix = `*[Scheduled]* ${task.friendlyInterval || task.cron}\n\n`;
      if (task.type === 'remind') {
        // Reminder: send the prompt text directly — no Claude API call needed
        await send(task.chatId, prefix + task.prompt);
      } else {
        // Task: run through Claude for intelligent processing
        const result = await runClaude(task.prompt, task.chatId);
        const cleaned = result.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').trim();
        await send(task.chatId, prefix + (cleaned || '✅ Done (no text output)'));
      }
      updateTaskLastRun(task.id, 'completed');
    } catch (e) {
      logger.error(`Scheduled task ${task.id} failed:`, e.message);
      try {
        await send(task.chatId, `*[Scheduled]* ${task.friendlyInterval || task.cron}\n\n❌ Error: ${e.message}`);
      } catch (sendErr) {
        logger.error(`Scheduled task ${task.id} error notification failed:`, sendErr.message);
      }
      updateTaskLastRun(task.id, 'error');
    }
  });

  activeJobs.set(task.id, job);
  logger.info(`Registered scheduled task ${task.id}: "${task.prompt}" (${task.cron})`);
}

function unregisterJob(taskId) {
  const job = activeJobs.get(taskId);
  if (job) {
    job.stop();
    activeJobs.delete(taskId);
  }
}

// --- Public API ---
function init(providerOrClient, sendFn) {
  waProvider = providerOrClient;
  if (sendFn) sendMessageFn = sendFn;
  // Reload all scheduled tasks from persisted state
  const tasks = loadScheduledTasks();
  for (const task of tasks) {
    if (task.enabled !== false) {
      registerJob(task);
    }
  }
  if (tasks.length > 0) {
    logger.info(`Restored ${tasks.length} scheduled task(s)`);
  }
}

function createSchedule(chatId, cronExpr, prompt, friendlyInterval, type) {
  const task = {
    id: generateId(),
    chatId,
    cron: cronExpr,
    friendlyInterval: friendlyInterval || cronExpr,
    prompt,
    type: type || 'task', // 'task' (run through Claude) or 'remind' (send directly)
    createdAt: Date.now(),
    lastRun: null,
    lastStatus: null,
    enabled: true,
  };
  saveScheduledTask(task);
  registerJob(task);
  return task;
}

function listSchedules(chatId) {
  return loadScheduledTasks().filter(t => t.chatId === chatId);
}

function removeSchedule(taskId, chatId) {
  unregisterJob(taskId);
  removeScheduledTask(taskId);
}

function removeAllSchedules(chatId) {
  const tasks = listSchedules(chatId);
  for (const t of tasks) {
    unregisterJob(t.id);
  }
  removeAllScheduledTasks(chatId);
  return tasks.length;
}

function parseScheduleCommand(text) {
  // Try friendly syntax: /schedule every 30m <prompt>
  const friendlyMatch = text.match(/^(every\s+\d+\s*(?:m|min|mins|h|hr|hrs|hour|hours|d|day|days))\s+(.+)/i);
  if (friendlyMatch) {
    const parsed = parseFriendlyInterval(friendlyMatch[1]);
    if (parsed) {
      return { cron: parsed.cron, friendly: parsed.friendly, prompt: friendlyMatch[2].trim() };
    }
  }

  // Try cron syntax: /schedule */30 * * * * <prompt>
  // Cron has 5 fields, so find first 5 space-separated tokens that look like cron
  const parts = text.trim().split(/\s+/);
  if (parts.length >= 6) {
    const cronParts = parts.slice(0, 5).join(' ');
    if (cron.validate(cronParts)) {
      return { cron: cronParts, friendly: cronParts, prompt: parts.slice(5).join(' ') };
    }
  }

  return null;
}

// ── Schedule/Remind tag parsing (intercept from Claude's output) ──

const SCHEDULE_TAG_REGEX = /<<(?:SCHEDULE|REMIND)\|([^|]+)\|(.+?)>>/g;

/**
 * Parse time string like "18:00", "6pm", "6:30pm", "6:30 pm"
 */
function parseTime(timeStr) {
  timeStr = timeStr.trim();
  // 24h: "18:00", "9:00", "0:00"
  let m = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (m) return { hour: parseInt(m[1], 10), minute: parseInt(m[2], 10) };
  // 12h: "6pm", "6:30pm", "12am", "6:30 pm"
  m = timeStr.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (m) {
    let hour = parseInt(m[1], 10);
    const minute = m[2] ? parseInt(m[2], 10) : 0;
    const period = m[3].toLowerCase();
    if (period === 'pm' && hour !== 12) hour += 12;
    if (period === 'am' && hour === 12) hour = 0;
    return { hour, minute };
  }
  return null;
}

function formatTime(hour, minute) {
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return `${h12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

const DAY_MAP = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

/**
 * Parse natural time expressions to cron.
 * Supports: "daily 18:00", "weekdays 9am", "every monday 10:00",
 *           "every 2h", "every 30m", raw cron "0 18 * * *", "hourly"
 */
function parseNaturalTime(expr) {
  expr = expr.trim();
  const lower = expr.toLowerCase();

  // Raw cron (5 space-separated fields)
  const cronParts = expr.split(/\s+/);
  if (cronParts.length === 5 && cron.validate(expr)) {
    return { cron: expr, friendly: expr };
  }

  // Existing friendly interval: "every 30m", "every 2h", "every 1d"
  const intervalParsed = parseFriendlyInterval(lower);
  if (intervalParsed) return intervalParsed;

  // "hourly"
  if (lower === 'hourly') return { cron: '0 * * * *', friendly: 'hourly' };

  // "daily [at] <time>"
  let match = lower.match(/^daily\s+(?:at\s+)?(.+)$/);
  if (match) {
    const time = parseTime(match[1]);
    if (time) return { cron: `${time.minute} ${time.hour} * * *`, friendly: `daily at ${formatTime(time.hour, time.minute)}` };
  }

  // "weekdays [at] <time>"
  match = lower.match(/^weekdays?\s+(?:at\s+)?(.+)$/);
  if (match) {
    const time = parseTime(match[1]);
    if (time) return { cron: `${time.minute} ${time.hour} * * 1-5`, friendly: `weekdays at ${formatTime(time.hour, time.minute)}` };
  }

  // "weekends [at] <time>"
  match = lower.match(/^weekends?\s+(?:at\s+)?(.+)$/);
  if (match) {
    const time = parseTime(match[1]);
    if (time) return { cron: `${time.minute} ${time.hour} * * 0,6`, friendly: `weekends at ${formatTime(time.hour, time.minute)}` };
  }

  // "every <day> [at] <time>"
  match = lower.match(/^every\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|wed|thu|fri|sat)\s+(?:at\s+)?(.+)$/);
  if (match) {
    const dayNum = DAY_MAP[match[1]];
    const time = parseTime(match[2]);
    if (time && dayNum !== undefined) {
      const dayName = match[1].charAt(0).toUpperCase() + match[1].slice(1);
      return { cron: `${time.minute} ${time.hour} * * ${dayNum}`, friendly: `every ${dayName} at ${formatTime(time.hour, time.minute)}` };
    }
  }

  return null;
}

/**
 * Extract <<SCHEDULE|...|...>> and <<REMIND|...|...>> tags from Claude's response.
 * Returns { schedules: [{ type, cron, friendly, prompt }], cleaned: string }
 */
function extractScheduleTags(text) {
  const schedules = [];
  const cleaned = text.replace(SCHEDULE_TAG_REGEX, (full, timeExpr, prompt) => {
    const type = full.startsWith('<<REMIND') ? 'remind' : 'task';
    const parsed = parseNaturalTime(timeExpr.trim());
    if (parsed) {
      schedules.push({ type, cron: parsed.cron, friendly: parsed.friendly, prompt: prompt.trim() });
    } else {
      logger.warn(`Failed to parse schedule time expression: "${timeExpr}"`);
    }
    return '';
  });
  return { schedules, cleaned: cleaned.replace(/\n{3,}/g, '\n\n').trim() };
}

/**
 * Strip schedule/remind tags from text (for streaming — remove without processing).
 */
function stripScheduleTags(text) {
  return text.replace(SCHEDULE_TAG_REGEX, '').replace(/\n{3,}/g, '\n\n').trim();
}

module.exports = {
  init,
  createSchedule,
  listSchedules,
  removeSchedule,
  removeAllSchedules,
  parseScheduleCommand,
  parseNaturalTime,
  extractScheduleTags,
  stripScheduleTags,
};
