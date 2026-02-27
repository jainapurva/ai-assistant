const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./logger');
const { buildSafeEnv, filterSensitiveOutput, SECURITY_SYSTEM_PROMPT } = require('./security');

// Persistent state file — survives bot restarts
const STATE_FILE = path.join(config.stateDir, 'bot_state.json');

// Per-chat session tracking (chatId -> sessionId)
const sessions = new Map();

// Per-chat project directory (chatId -> directory path)
const projectDirs = new Map();

// Per-chat model override (chatId -> model string)
const chatModels = new Map();

// Active claude subprocess per chat (chatId -> { proc, startTime, prompt })
const activeProcesses = new Map();

// Task history per chat (chatId -> array of last 5 completed tasks)
const taskHistory = new Map();

// --- Global concurrency limiter for Claude CLI processes ---
// Claude CLI uses local state (~/.claude/) and concurrent processes can collide,
// causing "exited with code 1" errors when multiple chats fire simultaneously.
const MAX_CONCURRENT_CLAUDE = 20;
let runningClaudeCount = 0;
const claudeWaitQueue = []; // Array of { resolve } callbacks waiting for a slot

function acquireClaudeSlot() {
  if (runningClaudeCount < MAX_CONCURRENT_CLAUDE) {
    runningClaudeCount++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    claudeWaitQueue.push({ resolve });
    logger.info(`Claude concurrency limit reached (${runningClaudeCount}/${MAX_CONCURRENT_CLAUDE}), queuing. ${claudeWaitQueue.length} waiting.`);
  });
}

function releaseClaudeSlot() {
  if (claudeWaitQueue.length > 0) {
    const next = claudeWaitQueue.shift();
    next.resolve();
    // runningClaudeCount stays the same (slot transferred)
  } else {
    runningClaudeCount--;
  }
}

function isGroupChat(chatId) {
  return chatId && chatId.endsWith('@g.us');
}

// Load persisted state on startup
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      if (data.projectDirs) {
        for (const [chatId, dir] of Object.entries(data.projectDirs)) {
          if (!fs.existsSync(dir)) continue;
          projectDirs.set(chatId, dir);
          logger.info(`Restored project mapping: ${chatId} → ${dir}`);
        }
      }
      if (data.sessions) {
        for (const [chatId, sessionId] of Object.entries(data.sessions)) {
          sessions.set(chatId, sessionId);
          logger.info(`Restored session: ${chatId} → ${sessionId}`);
        }
      }
      if (data.chatModels) {
        for (const [chatId, model] of Object.entries(data.chatModels)) {
          chatModels.set(chatId, model);
          logger.info(`Restored model: ${chatId} → ${model}`);
        }
      }
      if (data.tokenCounters) {
        for (const [chatId, counter] of Object.entries(data.tokenCounters)) {
          tokenCounters.set(chatId, counter);
        }
      }
    }
  } catch (e) {
    logger.warn('Failed to load state:', e.message);
  }
}

// Save state to disk
function saveState() {
  try {
    const data = {
      projectDirs: Object.fromEntries(projectDirs),
      sessions: Object.fromEntries(sessions),
      chatModels: Object.fromEntries(chatModels),
      tokenCounters: Object.fromEntries(tokenCounters),
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    logger.warn('Failed to save state:', e.message);
  }
}

// Load on module init
loadState();

function setProjectDir(chatId, dir) {
  if (!fs.existsSync(dir)) {
    throw new Error(`Directory does not exist: ${dir}`);
  }
  projectDirs.set(chatId, dir);
  saveState();
  logger.info(`Project dir set for ${chatId}: ${dir}`);
}

function getProjectDir(chatId) {
  return projectDirs.get(chatId) || null;
}

function clearProjectDir(chatId) {
  projectDirs.delete(chatId);
  saveState();
}

function setChatModel(chatId, model) {
  chatModels.set(chatId, model);
  saveState();
  logger.info(`Model set for ${chatId}: ${model}`);
}

function getChatModel(chatId) {
  return chatModels.get(chatId) || null;
}

function clearChatModel(chatId) {
  chatModels.delete(chatId);
  saveState();
}

// System prompt prepended to first message in a session to instruct Claude on memory
const MEMORY_SYSTEM_PROMPT = `IMPORTANT INSTRUCTIONS FOR THIS SESSION:
You are running via a WhatsApp bot. The user controls you from their phone.

MEMORY & CONTINUITY:
- After every significant task, decision, or discussion, update the project's CLAUDE.md file with what was done, key decisions made, and current state.
- If CLAUDE.md doesn't exist in the project directory, create it with a clear structure.
- Keep CLAUDE.md concise but complete — it's the memory that persists across sessions.
- Structure CLAUDE.md with sections like: ## Project Overview, ## Architecture, ## Current State, ## Key Decisions, ## Recent Changes, ## TODO
- When resuming work, always read CLAUDE.md first to understand where we left off.
- Save reusable patterns, gotchas, and lessons learned so future sessions don't repeat mistakes.

WORKING STYLE:
- Act autonomously. Don't ask for permission — just do the work.
- Only ask before deleting/removing things.
- When you complete a task, briefly confirm what was done.
- Keep responses concise — this is WhatsApp, not a terminal.

${SECURITY_SYSTEM_PROMPT}
`;

async function runClaude(prompt, chatId, _isRetry = false) {
  // Wait for a concurrency slot before spawning
  await acquireClaudeSlot();

  const model = getChatModel(chatId) || config.claudeModel;
  const args = [
    '-p',
    '--model', model,
    '--effort', 'medium',
    '--dangerously-skip-permissions',
    '--output-format', 'json',
  ];

  let sessionId = null;
  if (config.enableSessions) {
    sessionId = sessions.get(chatId) || null;
  }

  const hasSession = !!sessionId;

  // Resume existing session
  if (hasSession) {
    args.push('--resume', sessionId);
  }

  // For new sessions, prepend the memory system prompt
  const fullPrompt = hasSession ? prompt : MEMORY_SYSTEM_PROMPT + prompt;
  args.push(fullPrompt);

  // Layer 2: whitelist-only env — strips all API keys, tokens, and secrets
  const spawnEnv = buildSafeEnv();

  const cwd = getProjectDir(chatId) || process.env.HOME;
  logger.info(`Spawning claude [${runningClaudeCount}/${MAX_CONCURRENT_CLAUDE}] in ${cwd}: ${args.slice(0, -1).join(' ')} "<prompt>"`);
  const proc = spawn(config.claudePath, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd,
    env: spawnEnv,
  });

  return new Promise((resolve, reject) => {
    // Track active process so it can be killed by /stop
    const promptPreview = prompt.slice(0, 80).replace(/\n/g, ' ');
    activeProcesses.set(chatId, { proc, startTime: Date.now(), prompt: promptPreview });
    proc._stoppedByUser = false;

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    // Only set timeout if configured (0 = no timeout)
    let timer = null;
    if (config.commandTimeoutMs > 0) {
      timer = setTimeout(() => {
        proc.kill('SIGTERM');
        releaseClaudeSlot();
        reject(new Error(`Claude CLI timed out (${config.commandTimeoutMs / 60000} min).`));
      }, config.commandTimeoutMs);
    }

    proc.on('close', (code) => {
      if (timer) clearTimeout(timer);
      releaseClaudeSlot();

      const processEntry = activeProcesses.get(chatId);
      activeProcesses.delete(chatId);

      const endTime = Date.now();
      const startTime = processEntry ? processEntry.startTime : endTime;
      const durationSecs = Math.round((endTime - startTime) / 1000);

      if (proc._stoppedByUser) {
        addTaskHistory(chatId, { prompt: promptPreview, startTime, endTime, durationSecs, tokens: null, status: 'stopped' });
        return reject(new Error('STOPPED_BY_USER'));
      }

      // Build error message from stderr + stdout (Claude CLI often puts errors in stdout as JSON)
      let errorDetail = stderr.trim();
      if (!errorDetail && stdout.trim()) {
        try {
          const errJson = JSON.parse(stdout);
          errorDetail = errJson.error || errJson.message || stdout.slice(0, 300);
        } catch {
          errorDetail = stdout.slice(0, 300);
        }
      }

      // Retry with fresh session if --resume failed (stale/expired session)
      if (code !== 0 && hasSession && !_isRetry) {
        logger.warn(`Resume failed for ${chatId} (code ${code}): ${errorDetail.slice(0, 200)}`);
        clearSession(chatId);
        // Delay retry slightly to avoid racing with stale CLI state
        setTimeout(() => resolve(runClaude(prompt, chatId, true)), 1000);
        return;
      }

      if (code !== 0) {
        logger.error(`claude exited with code ${code}: ${errorDetail}`);
        addTaskHistory(chatId, { prompt: promptPreview, startTime, endTime, durationSecs, tokens: null, status: 'error' });
        return reject(new Error(`Claude exited with code ${code}: ${errorDetail.slice(0, 200)}`));
      }

      let result = stdout;
      let tokens = null;

      try {
        const json = JSON.parse(stdout);
        if (json.session_id) {
          sessions.set(chatId, json.session_id);
          saveState();
          if (!hasSession) {
            logger.info(`New session created: ${json.session_id}`);
          }
        }
        // Parse token usage if available
        if (json.usage) {
          tokens = { input: json.usage.input_tokens || 0, output: json.usage.output_tokens || 0 };
        }
        result = json.result || stdout;
      } catch (e) {
        logger.warn('Failed to parse JSON output, using raw text');
        result = stdout;
      }

      addTaskHistory(chatId, { prompt: promptPreview, startTime, endTime, durationSecs, tokens, status: 'completed' });

      // Layer 3: filter sensitive content from output before sending to WhatsApp
      const filtered = filterSensitiveOutput(result);
      if (filtered.redacted) {
        logger.warn(`Sensitive content redacted from Claude output (${chatId}): ${filtered.labels.join(', ')}`);
      }

      resolve(filtered.text);
    });

    proc.on('error', (err) => {
      if (timer) clearTimeout(timer);
      releaseClaudeSlot();
      activeProcesses.delete(chatId);
      reject(err);
    });
  });
}

function clearSession(chatId) {
  sessions.delete(chatId);
  saveState();
}

// Kill the active claude process for a chat (user-initiated stop)
function stopClaude(chatId) {
  const entry = activeProcesses.get(chatId);
  if (!entry) return false;

  const { proc } = entry;
  // Mark as stopped before killing so close handler knows it was intentional
  proc._stoppedByUser = true;

  proc.kill('SIGTERM');
  // Force kill after 3s if SIGTERM isn't enough
  setTimeout(() => {
    try { proc.kill('SIGKILL'); } catch (e) {}
  }, 3000);

  activeProcesses.delete(chatId);
  logger.info(`Process stopped by user for chat ${chatId}`);
  return true;
}

function isRunning(chatId) {
  return activeProcesses.has(chatId);
}

// Get info about the running task for /status
function getRunningInfo(chatId) {
  const entry = activeProcesses.get(chatId);
  if (!entry) return null;
  const elapsed = Math.round((Date.now() - entry.startTime) / 1000);
  return { elapsed, prompt: entry.prompt };
}

// Task history management — keep last 5 per chat
function addTaskHistory(chatId, entry) {
  if (!taskHistory.has(chatId)) taskHistory.set(chatId, []);
  const history = taskHistory.get(chatId);
  history.push(entry);
  if (history.length > 5) history.shift();

  // Also accumulate lifetime token usage
  if (entry.tokens) {
    addTokenUsage(chatId, entry.tokens);
  }
}

function getTaskHistory(chatId) {
  return taskHistory.get(chatId) || [];
}

// ── Token usage counters ────────────────────────────────────────────────────

const tokenCounters = new Map();

function addTokenUsage(chatId, tokens) {
  if (!tokens) return;
  const c = tokenCounters.get(chatId) || { input: 0, output: 0, tasks: 0 };
  c.input += tokens.input || 0;
  c.output += tokens.output || 0;
  c.tasks += 1;
  tokenCounters.set(chatId, c);
  saveState();
}

function getTokenUsage(chatId) {
  return tokenCounters.get(chatId) || { input: 0, output: 0, tasks: 0 };
}

function resetTokenUsage(chatId) {
  tokenCounters.delete(chatId);
  saveState();
}

module.exports = {
  runClaude, stopClaude, isRunning, getRunningInfo, getTaskHistory,
  clearSession, setProjectDir, getProjectDir, clearProjectDir,
  setChatModel, getChatModel, clearChatModel,
  loadState, saveState, isGroupChat, STATE_FILE,
  getTokenUsage, resetTokenUsage,
};
