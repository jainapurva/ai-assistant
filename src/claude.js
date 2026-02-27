const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./logger');
const { buildSafeEnv, filterSensitiveOutput, SECURITY_SYSTEM_PROMPT } = require('./security');
const docker = require('./docker');

// Persistent state file — survives bot restarts (namespaced per instance)
// Uses BOT_STATE_DIR env var (absolute path) so prod and dev clones share the same file.
const STATE_FILE = path.join(config.stateDir, `bot_state_${config.instanceId}.json`);

// Shared state file — for group chats (uses stateDir to avoid conflicts with other bot instances)
const SHARED_STATE_FILE = path.join(config.stateDir, '.bot-shared-state.json');

// Per-chat session tracking (chatId -> sessionId) — DM chats only
const sessions = new Map();

// Per-chat project directory (chatId -> directory path) — DM chats only
const projectDirs = new Map();

// Per-chat model override (chatId -> model string) — DM chats only
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

// --- File locking for shared state (prevents race conditions between bot instances) ---
const LOCK_FILE = SHARED_STATE_FILE + '.lock';
const LOCK_STALE_MS = 5000;
const LOCK_MAX_RETRIES = 20;

function acquireFileLock() {
  for (let i = 0; i < LOCK_MAX_RETRIES; i++) {
    try {
      const fd = fs.openSync(LOCK_FILE, 'wx');
      fs.closeSync(fd);
      return true;
    } catch (e) {
      if (e.code === 'EEXIST') {
        // Check if lock is stale
        try {
          const stat = fs.statSync(LOCK_FILE);
          if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
            try { fs.unlinkSync(LOCK_FILE); } catch {}
            continue;
          }
        } catch {}
        // Wait and retry
        const waitMs = 50 + Math.random() * 100;
        const start = Date.now();
        while (Date.now() - start < waitMs) { /* spin wait */ }
      } else {
        return false;
      }
    }
  }
  logger.warn('Failed to acquire shared state lock after retries');
  return false;
}

function releaseFileLock() {
  try { fs.unlinkSync(LOCK_FILE); } catch {}
}

function withSharedStateLock(fn) {
  acquireFileLock();
  try {
    return fn();
  } finally {
    releaseFileLock();
  }
}

// --- Shared state helpers (for group chats, shared between both bots) ---
function loadSharedState() {
  try {
    if (fs.existsSync(SHARED_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(SHARED_STATE_FILE, 'utf8'));
    }
  } catch (e) {}
  return { sessions: {}, projectDirs: {} };
}

function saveSharedState(data) {
  try {
    fs.writeFileSync(SHARED_STATE_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    logger.warn('Failed to save shared state:', e.message);
  }
}

// Locked read-modify-write helper for shared state
function updateSharedState(fn) {
  return withSharedStateLock(() => {
    const state = loadSharedState();
    fn(state);
    saveSharedState(state);
    return state;
  });
}

// Load persisted state on startup
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      const groupDirsToMigrate = {};
      if (data.projectDirs) {
        for (const [chatId, dir] of Object.entries(data.projectDirs)) {
          if (!fs.existsSync(dir)) continue;
          if (isGroupChat(chatId)) {
            // Group project dirs belong in shared state, not local — migrate them
            groupDirsToMigrate[chatId] = dir;
          } else {
            projectDirs.set(chatId, dir);
            logger.info(`Restored project mapping: ${chatId} → ${dir}`);
          }
        }
      }
      // Migrate any group dirs from old local state into shared state
      if (Object.keys(groupDirsToMigrate).length > 0) {
        updateSharedState(state => {
          for (const [chatId, dir] of Object.entries(groupDirsToMigrate)) {
            if (!state.projectDirs[chatId]) {
              state.projectDirs[chatId] = dir;
              logger.info(`Migrated group project mapping to shared state: ${chatId} → ${dir}`);
            }
          }
        });
        // Remove migrated group dirs from local state file
        const cleaned = { ...data, projectDirs: Object.fromEntries(
          Object.entries(data.projectDirs || {}).filter(([id]) => !isGroupChat(id))
        )};
        try { fs.writeFileSync(STATE_FILE, JSON.stringify(cleaned, null, 2)); } catch {}
      }
      if (data.sessions) {
        for (const [chatId, sessionId] of Object.entries(data.sessions)) {
          if (!isGroupChat(chatId)) {
            sessions.set(chatId, sessionId);
            logger.info(`Restored session: ${chatId} → ${sessionId}`);
          }
        }
      }
      if (data.chatModels) {
        for (const [chatId, model] of Object.entries(data.chatModels)) {
          if (!isGroupChat(chatId)) {
            chatModels.set(chatId, model);
            logger.info(`Restored model: ${chatId} → ${model}`);
          }
        }
      }
      if (data.tokenCounters) {
        for (const [chatId, counter] of Object.entries(data.tokenCounters)) {
          if (!isGroupChat(chatId)) tokenCounters.set(chatId, counter);
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
  if (isGroupChat(chatId)) {
    updateSharedState(state => { state.projectDirs[chatId] = dir; });
  } else {
    projectDirs.set(chatId, dir);
    saveState();
  }
  logger.info(`Project dir set for ${chatId}: ${dir}`);
}

function getProjectDir(chatId) {
  if (isGroupChat(chatId)) {
    return withSharedStateLock(() => loadSharedState().projectDirs[chatId] || null);
  }
  return projectDirs.get(chatId) || null;
}

function clearProjectDir(chatId) {
  if (isGroupChat(chatId)) {
    updateSharedState(state => { delete state.projectDirs[chatId]; });
  } else {
    projectDirs.delete(chatId);
    saveState();
  }
}

function setChatModel(chatId, model) {
  if (isGroupChat(chatId)) {
    updateSharedState(state => { state.chatModels = state.chatModels || {}; state.chatModels[chatId] = model; });
  } else {
    chatModels.set(chatId, model);
    saveState();
  }
  logger.info(`Model set for ${chatId}: ${model}`);
}

function getChatModel(chatId) {
  if (isGroupChat(chatId)) {
    return withSharedStateLock(() => { const s = loadSharedState(); return (s.chatModels && s.chatModels[chatId]) || null; });
  }
  return chatModels.get(chatId) || null;
}

function clearChatModel(chatId) {
  if (isGroupChat(chatId)) {
    updateSharedState(state => { if (state.chatModels) delete state.chatModels[chatId]; });
  } else {
    chatModels.delete(chatId);
    saveState();
  }
}

// Load optional per-instance prompt supplement (e.g. GitHub identity for Apurva)
let instancePrompt = '';
if (config.instancePromptFile) {
  try {
    instancePrompt = fs.readFileSync(config.instancePromptFile, 'utf8').trim();
  } catch (e) {
    logger.warn(`Failed to load instance prompt file "${config.instancePromptFile}":`, e.message);
  }
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

${instancePrompt ? instancePrompt + '\n\n' : ''}WORKING STYLE:
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

  // For group chats, use shared session store so both bots share the same Claude session
  let sessionId = null;
  if (config.enableSessions) {
    if (isGroupChat(chatId)) {
      sessionId = withSharedStateLock(() => loadSharedState().sessions[chatId] || null);
    } else {
      sessionId = sessions.get(chatId) || null;
    }
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

  // Spawn Claude — groups run inside a Docker sandbox, DMs run on the host
  let proc;
  if (isGroupChat(chatId)) {
    // cwd inside the container is /workspace (set by docker exec -w)
    logger.info(`Spawning claude [${runningClaudeCount}/${MAX_CONCURRENT_CLAUDE}] in Docker sandbox for ${chatId}: ${args.slice(0, -1).join(' ')} "<prompt>"`);
    proc = await docker.spawnInContainer(chatId, args, spawnEnv);
  } else {
    // DM (admin) chats run on the host with full filesystem access
    const cwd = getProjectDir(chatId) || process.env.HOME;
    logger.info(`Spawning claude [${runningClaudeCount}/${MAX_CONCURRENT_CLAUDE}] in ${cwd}: ${args.slice(0, -1).join(' ')} "<prompt>"`);
    proc = spawn(config.claudePath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd,
      env: spawnEnv,
    });
  }

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
          // Save session — to shared store for groups, local for DMs
          if (isGroupChat(chatId)) {
            updateSharedState(state => { state.sessions[chatId] = json.session_id; });
          } else {
            sessions.set(chatId, json.session_id);
            saveState();
          }
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
  if (isGroupChat(chatId)) {
    updateSharedState(state => { delete state.sessions[chatId]; });
  } else {
    sessions.delete(chatId);
    saveState();
  }
}

// --- Group distributed lock (prevents two bot instances from processing the same group simultaneously) ---
const GROUP_LOCK_TTL_MS = 10 * 60 * 1000; // 10 min — max time a lock is considered valid

function acquireGroupLock(chatId) {
  return withSharedStateLock(() => {
    const state = loadSharedState();
    if (!state.locks) state.locks = {};
    const lock = state.locks[chatId];
    if (lock && (Date.now() - lock.timestamp) < GROUP_LOCK_TTL_MS) {
      return false;
    }
    state.locks[chatId] = { timestamp: Date.now(), botName: config.botName };
    saveSharedState(state);
    return true;
  });
}

function releaseGroupLock(chatId) {
  updateSharedState(state => {
    if (!state.locks) return;
    delete state.locks[chatId];
  });
}

// --- Shared group data helpers (polls, quickReplies, projectPolls) ---
function getGroupSharedData(chatId, key) {
  return withSharedStateLock(() => {
    const state = loadSharedState();
    return (state[key] && state[key][chatId]) ? state[key][chatId] : null;
  });
}

function setGroupSharedData(chatId, key, value) {
  updateSharedState(state => {
    if (!state[key]) state[key] = {};
    state[key][chatId] = value;
  });
}

function deleteGroupSharedData(chatId, key) {
  updateSharedState(state => {
    if (state[key] && state[key][chatId] !== undefined) {
      delete state[key][chatId];
    }
  });
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
// DM counters stored locally; group counters stored in shared state.

const tokenCounters = new Map(); // DM chats only

function addTokenUsage(chatId, tokens) {
  if (!tokens) return;
  if (isGroupChat(chatId)) {
    updateSharedState(state => {
      if (!state.tokenCounters) state.tokenCounters = {};
      const c = state.tokenCounters[chatId] || { input: 0, output: 0, tasks: 0 };
      c.input += tokens.input || 0;
      c.output += tokens.output || 0;
      c.tasks += 1;
      state.tokenCounters[chatId] = c;
    });
  } else {
    const c = tokenCounters.get(chatId) || { input: 0, output: 0, tasks: 0 };
    c.input += tokens.input || 0;
    c.output += tokens.output || 0;
    c.tasks += 1;
    tokenCounters.set(chatId, c);
    saveState();
  }
}

function getTokenUsage(chatId) {
  if (isGroupChat(chatId)) {
    const state = loadSharedState();
    return (state.tokenCounters || {})[chatId] || { input: 0, output: 0, tasks: 0 };
  }
  return tokenCounters.get(chatId) || { input: 0, output: 0, tasks: 0 };
}

function resetTokenUsage(chatId) {
  if (isGroupChat(chatId)) {
    updateSharedState(state => {
      if (state.tokenCounters) delete state.tokenCounters[chatId];
    });
  } else {
    tokenCounters.delete(chatId);
    saveState();
  }
}

// Message deduplication for group chats — prevents both bot instances from processing the same message
function claimGroupMessage(msgId) {
  return withSharedStateLock(() => {
    const state = loadSharedState();
    if (!state.claimedMessages) state.claimedMessages = {};

    // Clean up claims older than 1 hour
    const now = Date.now();
    for (const [id, claim] of Object.entries(state.claimedMessages)) {
      if (now - claim.timestamp > 3600000) delete state.claimedMessages[id];
    }

    if (state.claimedMessages[msgId]) return false;
    state.claimedMessages[msgId] = { instanceId: config.instanceId, timestamp: now };
    saveSharedState(state);
    return true;
  });
}

module.exports = {
  runClaude, stopClaude, isRunning, getRunningInfo, getTaskHistory,
  clearSession, setProjectDir, getProjectDir, clearProjectDir,
  setChatModel, getChatModel, clearChatModel,
  acquireGroupLock, releaseGroupLock,
  getGroupSharedData, setGroupSharedData, deleteGroupSharedData,
  claimGroupMessage,
  withSharedStateLock, loadSharedState, saveSharedState,
  loadState, saveState, isGroupChat, STATE_FILE,
  getTokenUsage, resetTokenUsage,
};
