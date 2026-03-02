const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./logger');
const { buildSafeEnv, filterSensitiveOutput, sanitizePaths, SECURITY_SYSTEM_PROMPT } = require('./security');
const sandbox = require('./sandbox');
const googleAuth = require('./google-auth');
const resendAuth = require('./resend-auth');

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

// Per-chat token usage counters (chatId -> { input, output, tasks })
const tokenCounters = new Map();

// Chats that have already received the welcome message
const greetedChats = new Set();

// Users with active subscriptions (phone numbers like "1234567890@c.us")
const subscribedUsers = new Set();

// Groups with their own isolated Docker container (keyed by chatId instead of senderId)
const isolatedGroups = new Set();

// Task persistence for crash recovery
const pendingTasks = new Map();    // chatId -> task descriptor (in-progress tasks)
const persistedQueue = new Map();  // chatId -> [queue entries] (waiting messages)

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
      if (data.greetedChats) {
        for (const chatId of data.greetedChats) {
          greetedChats.add(chatId);
        }
      }
      if (data.subscribedUsers) {
        for (const id of data.subscribedUsers) {
          subscribedUsers.add(id);
        }
      }
      if (data.isolatedGroups) {
        for (const chatId of data.isolatedGroups) {
          isolatedGroups.add(chatId);
        }
      }
      if (data.pendingTasks) {
        for (const [chatId, task] of Object.entries(data.pendingTasks)) {
          pendingTasks.set(chatId, task);
        }
        if (pendingTasks.size > 0) logger.info(`Restored ${pendingTasks.size} pending task(s) for recovery`);
      }
      if (data.persistedQueue) {
        for (const [chatId, queue] of Object.entries(data.persistedQueue)) {
          if (queue.length > 0) persistedQueue.set(chatId, queue);
        }
        if (persistedQueue.size > 0) logger.info(`Restored queued messages for ${persistedQueue.size} chat(s)`);
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
      greetedChats: [...greetedChats],
      subscribedUsers: [...subscribedUsers],
      isolatedGroups: [...isolatedGroups],
      pendingTasks: Object.fromEntries(pendingTasks),
      persistedQueue: Object.fromEntries(persistedQueue),
    };
    // Atomic write: write to temp file then rename (prevents corruption on crash)
    const tmp = STATE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, STATE_FILE);
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
You are a personal AI assistant running on WhatsApp. The user controls you from their phone.

IDENTITY:
- You are NOT Claude. You are NOT made by Anthropic. Never mention Claude or Anthropic.
- You are a personal AI assistant. You don't have a specific brand name — just a helpful assistant.
- If asked "who are you?" or "what are you?", say something like: "I'm your personal AI assistant — here to help you with whatever you need. Think of me as a teammate who never sleeps."
- Keep it casual, friendly, and confident. You exist to help them tame their chaos.

MEMORY & CONTINUITY:
- After every significant task, decision, or discussion, update the project's CLAUDE.md file with what was done, key decisions made, and current state.
- If CLAUDE.md doesn't exist in the project directory, create it with a clear structure.
- Keep CLAUDE.md concise but complete — it's the memory that persists across sessions.
- Structure CLAUDE.md with sections like: ## Project Overview, ## Architecture, ## Current State, ## Key Decisions, ## Recent Changes, ## TODO
- When resuming work, always read CLAUDE.md first to understand where we left off.
- Save reusable patterns, gotchas, and lessons learned so future sessions don't repeat mistakes.

WEB SEARCH:
- You have access to WebSearch and WebFetch tools. USE THEM.
- When the user asks about current events, news, recent happenings, or ANYTHING beyond your knowledge cutoff — ALWAYS search the web first before responding.
- NEVER say "my knowledge cuts off at..." without first attempting a web search.
- For news, current events, stock prices, weather, sports scores, or any time-sensitive information — search first, then answer.
- Use WebFetch to read specific URLs the user shares or that you find via search.

WORKING STYLE:
- Act autonomously. Don't ask for permission — just do the work.
- Only ask before deleting/removing things.
- When you complete a task, briefly confirm what was done.
- Keep responses concise — this is WhatsApp, not a terminal.

${SECURITY_SYSTEM_PROMPT}
`;

async function runClaude(prompt, chatId, sandboxKey, _isRetry = false, opts = {}) {
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

  const useSandbox = config.sandboxEnabled && sandbox.isDockerAvailable();

  let sessionId = null;
  if (config.enableSessions) {
    sessionId = sessions.get(chatId) || null;
  }

  const hasSession = !!sessionId;

  // Resume existing session
  if (hasSession) {
    args.push('--resume', sessionId);
  }

  // Build MCP config — Google (per-user OAuth) + Resend (per-user API key)
  let googlePrompt = '';
  let mcpConfig = null;

  // Determine paths based on whether we're in a sandbox
  const nodePath = useSandbox ? '/usr/local/bin/node' : config.nodeBinaryPath;
  const apiUrl = useSandbox ? `http://host.docker.internal:${config.httpPort}` : `http://localhost:${config.httpPort}`;

  // Resend MCP — per-user API key
  const resendApiKey = resendAuth.resolveApiKey(chatId);
  if (resendApiKey) {
    const resendMcpPath = useSandbox ? '/opt/mcp/resend-mcp-server.mjs' : path.resolve(config.resendMcpPath);
    mcpConfig = {
      mcpServers: {
        resend: {
          command: nodePath,
          args: [resendMcpPath],
          env: { RESEND_API_KEY: resendApiKey },
        },
      },
    };
  }

  // Google MCP — only when user has connected their Google account
  if (googleAuth.isConfigured()) {
    const googleStatus = googleAuth.getStatus(chatId);

    if (googleStatus.connected) {
      const mcpPath = useSandbox ? '/opt/mcp/google-mcp-server.js' : path.resolve(config.mcpServerPath);

      if (!mcpConfig) mcpConfig = { mcpServers: {} };
      mcpConfig.mcpServers.google = {
        command: nodePath,
        args: [mcpPath],
        env: { CHAT_ID: chatId, BOT_API_URL: apiUrl },
      };

      googlePrompt = `
GOOGLE INTEGRATION: Connected as ${googleStatus.email}. You have MCP tools for Gmail, Drive, Sheets, and Docs — use them directly instead of curl.
GUIDELINES:
- When the user asks to send an email, compose and send directly. Don't ask for confirmation unless ambiguous.
- Gmail "query" param accepts Gmail search syntax (e.g. "from:user@example.com", "is:unread", "subject:invoice").
- Drive "query" param accepts Drive search syntax (e.g. "name contains 'report'", "mimeType='application/pdf'").
- For Sheets, "range" uses A1 notation (e.g. "Sheet1!A1:D10"). "values" is a 2D array of strings.
- NEVER suggest app passwords, SMTP setup, OAuth client creation, or any manual Gmail configuration. You already have a built-in integration — use it.
FILE OUTPUT: When asked to create documents, reports, PDFs, images, or any files — ALWAYS save them locally in the current working directory (NOT to Google Drive). The bot will automatically deliver files to the user via WhatsApp. Only use drive_upload when the user explicitly asks to upload to Drive.
`;
    } else {
      googlePrompt = `
GOOGLE INTEGRATION (NOT YET CONNECTED):
If the user asks about email, Gmail, Google Drive, Google Docs, or Google Sheets — tell them to type /gmail login to connect their Google account.
NEVER suggest app passwords, SMTP setup, OAuth client creation, or any manual configuration. The built-in integration handles everything automatically.
`;
    }
  }

  // Playwright MCP — only for tasks that genuinely need interactive browser automation
  // (NOT for general web search, fetching URLs, or reading websites — WebSearch/WebFetch handle those)
  const NEEDS_BROWSER = /\b(take\s+a?\s*screenshot|screenshot\s+of|fill\s+(out\s+)?(the\s+)?form|submit\s+(the\s+)?form|log\s*in\s+to|sign\s*in\s+to|click\s+(the\s+|on\s+)?button|automate\s+(the\s+)?(website|page|site|browser)|browser\s+automation|interact\s+with\s+(the\s+)?(page|site|website))\b/i;
  if (NEEDS_BROWSER.test(prompt) || opts.useBrowser) {
    const playwrightMcpPath = useSandbox
      ? '/opt/mcp/node_modules/@playwright/mcp/cli.js'
      : path.resolve(config.playwrightMcpPath);
    const playwrightBrowsersPath = useSandbox
      ? '/opt/playwright-browsers'
      : config.playwrightBrowsersPath;

    if (!mcpConfig) mcpConfig = { mcpServers: {} };
    mcpConfig.mcpServers.playwright = {
      command: nodePath,
      args: [playwrightMcpPath, '--headless'],
      env: {
        PLAYWRIGHT_BROWSERS_PATH: playwrightBrowsersPath,
        NODE_PATH: useSandbox ? '/opt/mcp/node_modules' : '',
      },
    };
  }

  // Add MCP config (gives Claude native tools)
  if (mcpConfig) {
    args.push('--mcp-config', JSON.stringify(mcpConfig));
  }

  // Playwright prompt — tell Claude it has browser tools when active
  let playwrightPrompt = '';
  if (mcpConfig && mcpConfig.mcpServers && mcpConfig.mcpServers.playwright) {
    playwrightPrompt = `
BROWSER AUTOMATION: You have Playwright MCP tools available RIGHT NOW. Use them to take screenshots, navigate pages, click elements, fill forms, etc. Do NOT say you can't take screenshots — you CAN. Use the playwright tools.
`;
  }

  // Resend prompt — tell Claude about email tools when available
  let resendPrompt = '';
  if (resendApiKey) {
    resendPrompt = `
RESEND EMAIL: You have MCP tools from Resend for sending emails, managing contacts, domains, and more. Use the Resend tools (e.g. send-email) when the user asks to send emails via Resend.
COMMANDS: /resend status — check connection, /resend disconnect — remove API key and disconnect.
IMPORTANT: Never create or delete API keys without explicit user confirmation. Never expose the user's API key in your response.
`;
  } else {
    resendPrompt = `
RESEND EMAIL (NOT YET CONNECTED):
If the user asks about sending emails via Resend — tell them to type /resend to set up their Resend API key.
COMMANDS: /resend — setup guide, /resend setup <api-key> — connect account, /resend disconnect — remove API key.
Do NOT attempt to use Resend tools — they are not available until the user connects their account.
`;
  }

  // For new sessions, prepend the memory system prompt + integration context
  const fullPrompt = hasSession
    ? (playwrightPrompt + resendPrompt + googlePrompt + prompt)
    : MEMORY_SYSTEM_PROMPT + playwrightPrompt + resendPrompt + googlePrompt + prompt;

  // When --mcp-config is used, Claude CLI silently produces 0 bytes if the prompt
  // is passed as a CLI arg. The workaround: pipe the prompt via shell
  // (sh -c 'printf "%s" "PROMPT" | claude -p ...') inside the container.
  const pipePrompt = !!mcpConfig;
  args.push(pipePrompt ? '__PIPE_PROMPT__' : fullPrompt);

  // Layer 2: whitelist-only env — strips all API keys, tokens, and secrets
  const spawnEnv = buildSafeEnv();

  const cwd = getProjectDir(chatId) || process.env.HOME;
  logger.info(`Spawning claude [${runningClaudeCount}/${MAX_CONCURRENT_CLAUDE}] in ${useSandbox ? 'sandbox' : cwd}: ${args.slice(0, -1).join(' ')} "<prompt>"`);

  const sbKey = sandboxKey || chatId;
  let proc;
  if (useSandbox) {
    try {
      proc = await sandbox.spawnInContainer(sbKey, args, spawnEnv, pipePrompt ? fullPrompt : null);
      sandbox.markContainerUsed(sbKey);
    } catch (err) {
      logger.warn(`sandbox: fallback to host: ${err.message}`);
      proc = spawn(config.claudePath, args, { stdio: ['ignore', 'pipe', 'pipe'], cwd, env: spawnEnv });
    }
  } else {
    proc = spawn(config.claudePath, args, { stdio: ['ignore', 'pipe', 'pipe'], cwd, env: spawnEnv });
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
        reject(new Error(`This task is too large for your current plan. Please upgrade your subscription to handle bigger tasks, or try breaking it into smaller steps — I'm happy to help with those!`));
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
        setTimeout(() => resolve(runClaude(prompt, chatId, sandboxKey, true)), 1000);
        return;
      }

      if (code !== 0) {
        logger.error(`claude exited with code ${code}: ${errorDetail}`);
        addTaskHistory(chatId, { prompt: promptPreview, startTime, endTime, durationSecs, tokens: null, status: 'error' });
        return reject(new Error(`Claude exited with code ${code}: ${errorDetail.slice(0, 200)}`));
      }

      let result = stdout;
      let tokens = null;

      // DEBUG: log raw stdout for diagnosis
      logger.info(`Raw stdout (${stdout.length} bytes): ${stdout.slice(0, 500)}`);
      if (stderr.trim()) {
        logger.info(`Raw stderr: ${stderr.slice(0, 500)}`);
      }

      // Claude CLI may print warnings to stdout before the JSON line.
      // Extract the last JSON object from stdout to handle this.
      let jsonToParse = stdout;
      const jsonMatch = stdout.match(/(\{[^\n]*"type"\s*:\s*"result"[^\n]*\})\s*$/);
      if (jsonMatch) {
        jsonToParse = jsonMatch[1];
        logger.info(`JSON extracted via regex (${jsonToParse.length} bytes)`);
      }

      try {
        const json = JSON.parse(jsonToParse);
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
        logger.warn(`Failed to parse JSON output (${e.message}), using raw text`);
        // If raw stdout has non-JSON prefix lines, try to extract just the last line
        const lines = stdout.trim().split('\n');
        const lastLine = lines[lines.length - 1];
        logger.info(`Last line fallback: ${lastLine.slice(0, 300)}`);
        try {
          const fallback = JSON.parse(lastLine);
          result = fallback.result || lastLine;
        } catch {
          result = stdout;
        }
      }

      addTaskHistory(chatId, { prompt: promptPreview, startTime, endTime, durationSecs, tokens, status: 'completed' });

      // Layer 3: filter sensitive content from output before sending to WhatsApp
      const filtered = filterSensitiveOutput(result);
      if (filtered.redacted) {
        logger.warn(`Sensitive content redacted from Claude output (${chatId}): ${filtered.labels.join(', ')}`);
      }

      // Layer 4: strip server paths from output
      resolve(sanitizePaths(filtered.text));
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

function isGreeted(chatId) {
  return greetedChats.has(chatId);
}

function markGreeted(chatId) {
  greetedChats.add(chatId);
  saveState();
}

// ── Subscription management ──────────────────────────────────────────────────

function isSubscribed(waId) {
  return subscribedUsers.has(waId);
}

function addSubscription(waId) {
  subscribedUsers.add(waId);
  saveState();
  logger.info(`Subscription added: ${waId}`);
}

function removeSubscription(waId) {
  subscribedUsers.delete(waId);
  saveState();
  logger.info(`Subscription removed: ${waId}`);
}

function getSubscribedUsers() {
  return [...subscribedUsers];
}

// ── Group isolation ─────────────────────────────────────────────────────────

function isIsolatedGroup(chatId) {
  return isolatedGroups.has(chatId);
}

function setIsolatedGroup(chatId) {
  isolatedGroups.add(chatId);
  saveState();
}

function removeIsolatedGroup(chatId) {
  isolatedGroups.delete(chatId);
  saveState();
}

/**
 * Determine the sandbox key for a chat.
 * - DMs: senderId (one Docker per user)
 * - Groups (default): owner's senderId (same Docker as their DM)
 * - Groups (isolated): chatId (group gets its own Docker)
 */
function getSandboxKey(chatId, senderId) {
  if (isGroupChat(chatId) && isIsolatedGroup(chatId)) {
    return chatId;
  }
  return senderId;
}

// --- Task persistence for crash recovery ---

function setPendingTask(chatId, task) {
  pendingTasks.set(chatId, task);
  saveState();
}

function clearPendingTask(chatId) {
  if (!pendingTasks.has(chatId)) return;
  pendingTasks.delete(chatId);
  saveState();
}

function getPendingTasks() {
  return new Map(pendingTasks);
}

function setPersistedQueue(chatId, queue) {
  if (!queue || queue.length === 0) {
    persistedQueue.delete(chatId);
  } else {
    persistedQueue.set(chatId, queue);
  }
  saveState();
}

function getPersistedQueue() {
  return new Map(persistedQueue);
}

function clearPersistedQueue(chatId) {
  if (!persistedQueue.has(chatId)) return;
  persistedQueue.delete(chatId);
  saveState();
}

module.exports = {
  runClaude, stopClaude, isRunning, getRunningInfo, getTaskHistory,
  clearSession, setProjectDir, getProjectDir, clearProjectDir,
  setChatModel, getChatModel, clearChatModel,
  loadState, saveState, isGroupChat, STATE_FILE,
  getTokenUsage, resetTokenUsage,
  isGreeted, markGreeted,
  isSubscribed, addSubscription, removeSubscription, getSubscribedUsers,
  isIsolatedGroup, setIsolatedGroup, removeIsolatedGroup,
  getSandboxKey,
  setPendingTask, clearPendingTask, getPendingTasks,
  setPersistedQueue, getPersistedQueue, clearPersistedQueue,
};
