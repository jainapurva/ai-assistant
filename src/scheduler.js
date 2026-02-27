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
    logger.info(`Scheduled task ${task.id} executing: "${task.prompt}"`);
    try {
      const result = await runClaude(task.prompt, task.chatId);
      const cleaned = result.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').trim();
      const prefix = `*[Scheduled]* ${task.friendlyInterval || task.cron}\n\n`;
      await send(task.chatId, prefix + (cleaned || '✅ Done (no text output)'));
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

function createSchedule(chatId, cronExpr, prompt, friendlyInterval) {
  const task = {
    id: generateId(),
    chatId,
    cron: cronExpr,
    friendlyInterval: friendlyInterval || cronExpr,
    prompt,
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

module.exports = {
  init,
  createSchedule,
  listSchedules,
  removeSchedule,
  removeAllSchedules,
  parseScheduleCommand,
};
