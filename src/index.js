require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH || '.env' });
const path = require('path');
const fs = require('fs');
const config = require('./config');
const { createProvider } = require('./providers');
const { runClaude, stopClaude, isRunning, getRunningInfo, getTaskHistory, clearSession, setProjectDir, getProjectDir, clearProjectDir, setChatModel, getChatModel, clearChatModel, getTokenUsage, resetTokenUsage, isGreeted, markGreeted, isSubscribed, addSubscription, removeSubscription, getSubscribedUsers, isIsolatedGroup, setIsolatedGroup, removeIsolatedGroup, getSandboxKey, getUserAgent, setUserAgent, setPendingTask, clearPendingTask, getPendingTasks, setPersistedQueue, getPersistedQueue, clearPersistedQueue } = require('./claude');
const { ensureProfile, getProfile, registerUser, getAllProfiles, formatProfileCard } = require('./profiles');
const apiCommands = require('./api-commands');
const drive = require('./drive');
const googleAuth = require('./google-auth');
const microsoftAuth = require('./microsoft-auth');
const resendAuth = require('./resend-auth');
const { stripAnsi, chunkMessage, markdownToWhatsApp } = require('./formatter');
const { detectOptions } = require('./options');
const { discoverProjects, getProjectSummary } = require('./projects');
const sandbox = require('./sandbox');
const scheduler = require('./scheduler');
const logger = require('./logger');
const chatLogger = require('./chat-logger');
const activity = require('./activity-logger');
const { sanitizePaths } = require('./security');

// ── PID file (written after ports bind, see bottom of file) ──
const PID_FILE = path.join(
  process.env.BOT_STATE_DIR || '/media/ddarji/storage/ai-assistant',
  'bot.pid'
);
fs.mkdirSync(path.dirname(PID_FILE), { recursive: true });

// ── Registration check against website DB ──────────────────────────────────
const REGISTRATION_CHECK_URL = 'https://swayat.com/api/user/check';
const SIGNUP_URL = 'https://swayat.com';
const registrationCache = new Map(); // waId → { registered: boolean, checkedAt: number }
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function isRegistered(waId) {
  // Admins always pass
  if (isAdmin(waId)) return true;

  // Check cache
  const cached = registrationCache.get(waId);
  if (cached && Date.now() - cached.checkedAt < CACHE_TTL) {
    return cached.registered;
  }

  // waId format: "16262300167" → phone: "+16262300167"
  const phone = '+' + waId.replace('@c.us', '');
  try {
    const res = await fetch(`${REGISTRATION_CHECK_URL}?phone=${encodeURIComponent(phone)}`);
    const data = await res.json();
    const registered = data.registered === true && data.status === 'active';
    // Only cache positive results — never cache "not registered" so signup takes effect immediately
    if (registered) {
      registrationCache.set(waId, { registered, checkedAt: Date.now() });
    }
    return registered;
  } catch (err) {
    logger.error(`Registration check failed for ${waId}: ${err.message}`);
    // On error, allow through (don't block users due to API issues)
    return true;
  }
}

// Validate config: in non-open-access mode, whitelisted number is required
if (!config.openAccess) {
  if (!config.whitelistedNumber || config.whitelistedNumber === '91XXXXXXXXXX@c.us') {
    logger.error('Please set your WHITELISTED_NUMBER in .env file (or set OPEN_ACCESS=true)');
    process.exit(1);
  }
}

// Create the Cloud API provider
const provider = createProvider();

// Track in-flight requests and queue pending ones per chat
const processing = new Set();
const messageQueue = new Map(); // chatId -> [{ msg, chatId, prompt, mediaPath }]

// Track message IDs sent by the bot (scheduler/send API) to avoid re-processing them
const botSentMessageIds = new Set();

// Pending poll: when a poll is active, store the options so vote triggers the response
// Map of chatId -> { options: string[], chatId: string }
const pendingPolls = new Map();

// Quick reply options: numbered options that aren't polls (for number-tap replies)
// Map of chatId -> string[] of options
const quickReplies = new Map();

// Pending project selection poll: chatId -> { dirs: string[] }
const pendingProjectPolls = new Map();
const pendingFilePolls = new Map(); // chatId -> { files: [{ name, fullPath }] }

// Media batching: accumulate rapid-fire media messages before processing
const mediaBatch = new Map(); // chatId -> { msgs: [], timer, firstMsg, caption, senderId, senderName }
const MEDIA_BATCH_WINDOW_MS = 3000; // 3-second window to accumulate multiple media

// --- Poll state helpers (local Maps) ---
function getPendingPoll(chatId) { return pendingPolls.get(chatId) || null; }
function setPendingPoll(chatId, data) { pendingPolls.set(chatId, data); }
function clearPendingPoll(chatId) { pendingPolls.delete(chatId); }

function getQuickReplies(chatId) { return quickReplies.get(chatId) || null; }
function setQuickReplies(chatId, data) { quickReplies.set(chatId, data); }
function clearQuickReplies(chatId) { quickReplies.delete(chatId); }

function getPendingProjectPoll(chatId) { return pendingProjectPolls.get(chatId) || null; }
function setPendingProjectPoll(chatId, data) { pendingProjectPolls.set(chatId, data); }
function clearPendingProjectPoll(chatId) { pendingProjectPolls.delete(chatId); }

// --- Provider-agnostic send helpers ---

async function botReply(msg, text) {
  await provider.replyToMessage(msg, sanitizePaths(text));
}

async function botSendChunks(msg, text) {
  const formatted = markdownToWhatsApp(sanitizePaths(text));
  const chunks = chunkMessage(formatted, config.maxChunkSize);
  for (const chunk of chunks) {
    await provider.replyToMessage(msg, chunk);
  }
}

async function botSendPoll(chatId, question, options) {
  await provider.sendPoll(chatId, question, options.map(o => sanitizePaths(o)));
}

async function botSendMessage(chatId, text) {
  await provider.sendMessage(chatId, sanitizePaths(text));
}

/**
 * Process Claude's response — detect options and send as poll or formatted text
 */
async function sendClaudeResponse(msg, chatId, responseText) {
  const detected = detectOptions(responseText);

  if (detected) {
    // Send any text before the options
    if (detected.textBefore) {
      await botSendChunks(msg, detected.textBefore);
    }

    // Cloud API doesn't support native polls — send as numbered text list
    let optionText = `*${detected.pollQuestion}*\n\n`;
    detected.options.forEach((opt, i) => {
      optionText += `${i + 1}. ${opt}\n`;
    });
    optionText += `\n_Reply with a number (1-${detected.options.length}) to choose._`;
    await botSendChunks(msg, optionText);
    setQuickReplies(chatId, detected.options);
    logger.info(`Options detected: ${detected.options.length} choices sent as text list`);

    // Send any text after the options
    if (detected.textAfter) {
      await botSendChunks(msg, detected.textAfter);
    }
  } else {
    // No options — send as regular text
    clearQuickReplies(chatId);
    await botSendChunks(msg, responseText);
  }
}

/**
 * Main handler: process a prompt and send to Claude
 */
async function handlePrompt(msg, chatId, prompt, mediaPaths, senderName, senderId, opts = {}) {
  const isGroup = chatId.endsWith('@g.us');

  if (processing.has(chatId)) {
    // Queue the message instead of rejecting
    if (!messageQueue.has(chatId)) messageQueue.set(chatId, []);
    const queue = messageQueue.get(chatId);
    queue.push({ msg, chatId, prompt, mediaPaths, senderName, senderId, opts });
    // Persist queue for crash recovery (without msg objects which can't be serialized)
    setPersistedQueue(chatId, queue.map(q => ({
      chatId: q.chatId, prompt: q.prompt, mediaPaths: q.mediaPaths,
      senderName: q.senderName, senderId: q.senderId, opts: q.opts,
    })));
    await botReply(msg, `📋 Queued (#${queue.length} in line). I'll get to it after the current task.`);
    return;
  }
  processing.add(chatId);

  // Persist task for crash recovery
  setPendingTask(chatId, {
    chatId, prompt, mediaPaths: mediaPaths || null,
    senderName, senderId, opts,
    startedAt: Date.now(),
    retryCount: opts._retryCount || 0,
  });

  // For group chats, prefix with sender name so Claude knows who's talking
  if (isGroup) {
    const name = senderName || config.botName;
    prompt = `[${name}]: ${prompt}`;
  }

  await provider.sendTyping(chatId);

  // Log the user message
  const logSenderId = senderId || config.whitelistedNumber;
  chatLogger.logUserMessage(logSenderId, chatId, prompt);
  const agentId = getUserAgent(chatId);
  activity.logMessageIn(chatId, {
    agentId,
    senderId: logSenderId, senderName,
    type: mediaPaths ? 'media' : 'text',
    content: prompt,
    mediaType: mediaPaths ? 'attachment' : null,
    isGroup: chatId.endsWith('@g.us'),
  });

  // Only show "Working on it..." if Claude takes more than 5 seconds
  const WORKING_DELAY_MS = 5000;
  let workingSent = false;
  const workingTimer = setTimeout(async () => {
    try {
      workingSent = true;
      await botReply(msg, '⚡ Working on it...');
    } catch (e) {}
  }, WORKING_DELAY_MS);

  // Periodic progress pings — every 60s with random funny messages
  const PROGRESS_INTERVAL_MS = 60000;
  let progressCount = 0;
  const PROGRESS_MSGS = [
    'Still cooking... the recipe said 30 seconds but I think the oven lied 🍳',
    'Bribing the servers with compliments... "you\'re doing great sweetie" 💅',
    'My hamster is running as fast as he can on the wheel 🐹',
    'Currently arguing with the code... I\'m winning 🥊',
    'Making coffee while I wait for my brain to load ☕',
    'Plot twist: the task was the friends we made along the way 🎬',
    'Teaching a robot to think is harder than it looks 🤖',
    'Still here! Just had to refuel the AI juice 🧃',
    'If I had a dollar for every millisecond this is taking... 💰',
    'Running calculations... carry the 1... carry the 2... carry the fridge 🧮',
    'Asking the universe for answers... universe said "new phone who dis" 🌌',
    'Currently in a meeting with my neurons. They can\'t agree 🧠',
    'Almost there! Said every GPS ever... 🗺️',
    'Downloading more RAM... just kidding, I wish 💾',
    'I\'m not slow, I\'m just building suspense 🎭',
    'Training my pet algorithm. It\'s not house-trained yet 🐕',
    'Thinking so hard my circuits are getting a six-pack 💪',
    'Hold on, let me put on my thinking cap... ok it\'s on backwards 🧢',
    'Currently speedrunning this task... badly 🏃',
    'My code is compiling and my patience is decompiling ⏳',
  ];
  const usedMsgs = new Set();
  const progressTimer = setInterval(async () => {
    try {
      // Pick a random unused message
      let available = PROGRESS_MSGS.filter((_, i) => !usedMsgs.has(i));
      if (available.length === 0) { usedMsgs.clear(); available = PROGRESS_MSGS; }
      const idx = PROGRESS_MSGS.indexOf(available[Math.floor(Math.random() * available.length)]);
      usedMsgs.add(idx);
      const elapsed = Math.round((progressCount + 1) * PROGRESS_INTERVAL_MS / 60000);
      await botReply(msg, `${PROGRESS_MSGS[idx]} (${elapsed} min)`);
      progressCount++;
    } catch {}
  }, PROGRESS_INTERVAL_MS);

  try {
    const sbKey = getSandboxKey(chatId, senderId || config.whitelistedNumber);

    // Snapshot workspace files before Claude runs (for detecting new output files)
    // Only enabled when sandbox is active — never scan host filesystem
    const useSandbox = config.sandboxEnabled && sandbox.isBwrapAvailable();
    let workspaceDir = null;
    let filesBefore = new Map(); // filename -> mtime
    if (useSandbox) {
      workspaceDir = path.join(sandbox.getSandboxDir(sbKey), 'workspace');
      try {
        for (const f of fs.readdirSync(workspaceDir)) {
          try {
            const stat = fs.statSync(path.join(workspaceDir, f));
            if (stat.isFile()) filesBefore.set(f, stat.mtimeMs);
          } catch {}
        }
      } catch {}
    }

    const rawResponse = await runClaude(prompt, chatId, sbKey, false, { useBrowser: !!opts.useBrowser });
    clearTimeout(workingTimer);
    clearInterval(progressTimer);
    const cleaned = stripAnsi(rawResponse).trim();

    // Detect new files Claude created and send them to the user (sandbox-only)
    // < 10MB → send via WhatsApp directly
    // >= 10MB → upload to Google Drive (if connected), else warn
    const SENDABLE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf', '.mp4', '.mp3', '.ogg', '.csv', '.xlsx', '.docx', '.pptx', '.zip', '.txt', '.html', '.json', '.svg']);
    const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
    const DRIVE_THRESHOLD_BYTES = 10 * 1024 * 1024; // 10MB — above this, upload to Drive

    if (useSandbox && workspaceDir) try {
      const filesAfter = fs.readdirSync(workspaceDir);
      const fileSenderId = senderId || config.whitelistedNumber;
      const driveConnected = drive.isConfigured() && googleAuth.isConfigured() && googleAuth.getStatus(fileSenderId).connected;

      for (const f of filesAfter) {
        const fullPath = path.join(workspaceDir, f);
        try {
          const stat = fs.statSync(fullPath);
          if (!stat.isFile()) continue;
          // Only new files (not existing before Claude ran)
          if (filesBefore.has(f)) continue;
          // Skip uploaded media files (user's own input, not Claude's output)
          if (f.startsWith('wa_')) continue;
          const ext = path.extname(f).toLowerCase();
          if (!SENDABLE_EXTS.has(ext)) continue;
          if (stat.size === 0) continue;

          if (stat.size >= DRIVE_THRESHOLD_BYTES) {
            // Large file → upload to Google Drive
            if (driveConnected) {
              logger.info(`Output file ${f} is ${(stat.size / 1048576).toFixed(1)}MB — uploading to Drive`);
              try {
                const link = await drive.uploadFile(fileSenderId, chatId, chatId, fullPath);
                activity.logMediaOut(chatId, { agentId, filename: f, sizeBytes: stat.size, type: 'file', destination: 'drive' });
                await botReply(msg, `📤 *${f}* (${(stat.size / 1048576).toFixed(1)}MB) uploaded to Drive:\n${link}`);
              } catch (e) {
                await botReply(msg, `⚠️ File *${f}* is ${(stat.size / 1048576).toFixed(1)}MB — Drive upload failed: ${e.message}`);
              }
            } else {
              await botReply(msg, `⚠️ *${f}* is ${(stat.size / 1048576).toFixed(1)}MB — too large for WhatsApp. Use \`/gmail login\` to enable Drive uploads.`);
            }
          } else {
            // Small file → send directly via WhatsApp
            logger.info(`Sending output file to user: ${f} (${(stat.size / 1024).toFixed(1)}KB)`);
            activity.logMediaOut(chatId, { agentId, filename: f, sizeBytes: stat.size, type: IMAGE_EXTS.has(ext) ? 'image' : 'file', destination: 'whatsapp' });
            await provider.sendMedia(chatId, fullPath, {
              sendMediaAsDocument: true,
              caption: f,
            });
          }
        } catch (e) {
          logger.warn(`Failed to send output file ${f}: ${e.message}`);
        }
      }
    } catch (e) {
      logger.warn(`Failed to scan workspace for output files: ${e.message}`);
    }

    if (!cleaned) {
      chatLogger.logAIResponse(logSenderId, chatId, '(no text output)');
      activity.logMessageOut(chatId, { agentId, content: '(no text output)', chunks: 1, trigger: 'claude' });
      await botReply(msg, '✅ Done (no text output)');
      return;
    }

    chatLogger.logAIResponse(logSenderId, chatId, cleaned);
    activity.logMessageOut(chatId, { agentId, content: cleaned, trigger: 'claude' });
    await sendClaudeResponse(msg, chatId, cleaned);
    logger.info(`Response sent (${cleaned.length} chars)`);
  } catch (err) {
    clearTimeout(workingTimer);
    clearInterval(progressTimer);
    if (err.message === 'STOPPED_BY_USER') {
      logger.info(`Task stopped by user for chat ${chatId}`);
      chatLogger.logError(logSenderId, chatId, 'Stopped by user');
      activity.logError(chatId, { agentId, error: 'Stopped by user', context: 'task_stop' });
    } else {
      logger.error('Error processing message:', err.message);
      chatLogger.logError(logSenderId, chatId, err.message);
      activity.logError(chatId, { agentId, error: err.message, context: 'claude_run' });
      try { await botReply(msg, `❌ Error: ${err.message}`); } catch (e) {
        logger.error('Failed to send error reply:', e.message);
      }
    }
  } finally {
    clearPendingTask(chatId);
    processing.delete(chatId);
    await provider.clearTyping(chatId);
    // Clean up media for this task
    if (mediaPaths) {
      for (const mp of mediaPaths) {
        try { fs.unlinkSync(mp); } catch (e) {}
      }
    }
    // Sync message count to DB
    activity.syncToDb(chatId, { messagesIn: 1, messagesOut: 1 });
    // Process next queued message if any
    processQueue(chatId);
  }
}

// Process the next item in the queue for a chat
function processQueue(chatId) {
  const queue = messageQueue.get(chatId);
  if (!queue || queue.length === 0) {
    clearPersistedQueue(chatId);
    return;
  }
  const next = queue.shift();
  if (queue.length === 0) {
    messageQueue.delete(chatId);
    clearPersistedQueue(chatId);
  } else {
    // Update persisted queue with remaining items
    setPersistedQueue(chatId, queue.map(q => ({
      chatId: q.chatId, prompt: q.prompt, mediaPaths: q.mediaPaths,
      senderName: q.senderName, senderId: q.senderId, opts: q.opts,
    })));
  }
  logger.info(`Dequeuing next message for ${chatId} (${queue ? queue.length : 0} remaining)`);
  // Fire and forget — handlePrompt manages its own lifecycle
  handlePrompt(next.msg, next.chatId, next.prompt, next.mediaPaths, next.senderName, next.senderId, next.opts);
}

function getQueueLength(chatId) {
  const queue = messageQueue.get(chatId);
  return queue ? queue.length : 0;
}

const HELP_TEXT = `*Claude Code Bot* 🤖

Just send any message and I'll handle it for you.

*What can I do?*
📝 Answer questions & write content
🖼️ Analyze images — send one or multiple
📄 Read documents — PDFs, Word, Excel, and more
🎵 Transcribe audio & voice messages
🎬 Analyze videos
📧 Send emails (once connected)
💻 Write & run code in your own sandbox

_Files I create are automatically sent back to you!_

*Commands:*
/files - See & download files from your workspace
/gmail - Connect Gmail & Google Drive
/outlook - Connect Outlook email
/resend - Set up email sending via Resend
/github - Connect your GitHub repos
/repos - List connected repos
/repo <name> - Set active repo
/drive - List files uploaded to Google Drive
/sandbox - Check your workspace status
/sandbox clean - Clean sandbox workspace
/usage - See your token usage
/register <name> [email] - Create your user profile
/profile - View your profile & usage stats
/agents - See available agents
/agent <name> - Switch to a different agent
/stop - Stop a running task
/reset - Start fresh (clears session)
/status - Check bot status
/help - Show this message`;


// Returns true if the given WA ID is a configured admin
function isAdmin(waId) {
  if (!waId) return false;
  if (config.adminNumbers.length === 0) return false;
  return config.adminNumbers.includes(waId);
}

function isAllowedChat(chatId) {
  // Open access mode: all chats allowed (DMs + groups)
  if (config.openAccess) return true;

  // Allow specific target chat (DM with bot owner)
  if (config.targetChat && chatId === config.targetChat) return true;

  return false;
}

// Patterns that identify bot-generated messages — never process these as user input.
// This prevents cross-instance loops where one bot's reply triggers the other bot.
const BOT_MESSAGE_PREFIXES = [
  '📋 Queued',
  '⚡ Working on it',
  '⛔ Stopped',
  '❌ Error:',
  '*[Scheduled]*',
  '🔒 This command',
  '*Claude Code Bot*',
  '✅ *Idle',
  '✅ Done',
  '📋 Queue cleared',
];

function isBotGeneratedMessage(text) {
  return BOT_MESSAGE_PREFIXES.some(prefix => text.startsWith(prefix));
}

// --- /send route on public webhook server (called by swayat.com signup) ---
provider.addRoute('POST', '/send', (req, res) => {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      const { chatId, message } = JSON.parse(body);
      if (!chatId || !message) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'chatId and message required' }));
      }
      await botSendMessage(chatId, message);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'sent' }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
  });
});

// --- /setup-agent route (called by swayat.com signup to set agent + send welcome) ---
provider.addRoute('POST', '/setup-agent', (req, res) => {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      const { chatId, agentId } = JSON.parse(body);
      if (!chatId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'chatId required' }));
      }

      const agents = require('./agents');
      const agent = agents.getAgent(agentId || 'general');

      // Set the user's active agent
      setUserAgent(chatId, agent.id);

      // Send agent-specific welcome (or default)
      if (agent.welcome) {
        await botSendMessage(chatId, agent.welcome);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', agent: agent.id }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
  });
});

// --- Google OAuth callback (registered on public webhook server) ---

if (googleAuth.isConfigured()) {
  provider.addRoute('GET', '/auth/google/callback', async (req, res) => {
    try {
      const url = new URL(req.url, `http://localhost:${config.webhookPort}`);
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const error = url.searchParams.get('error');

      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h2>Authorization cancelled.</h2><p>You can close this window and try /gmail login again in WhatsApp.</p>');
        return;
      }

      if (!code || !state) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<h2>Missing authorization code.</h2>');
        return;
      }

      const result = await googleAuth.handleCallback(code, state);

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<h2>Google connected!</h2><p>Signed in as <b>${result.email}</b>.</p><p>Gmail, Drive, Docs & Sheets are now available.</p><p>You can close this window and return to WhatsApp.</p>`);

      // Notify user on WhatsApp
      await botSendMessage(result.waId, `*Google connected!*\n\nSigned in as *${result.email}*.\n\nYou now have access to:\n• *Gmail* — /gmail send, inbox, read\n• *Drive* — /drive to list files\n• *Docs & Sheets* — via AI assistant\n\n\`/gmail logout\` to disconnect.`);
    } catch (e) {
      logger.error('Google OAuth callback error:', e.message);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<h2>Authorization failed.</h2><p>${e.message}</p><p>Please try /gmail login again.</p>`);
    }
  });
  logger.info('Google integration enabled (Gmail, Drive, Docs, Sheets)');
}

// --- Microsoft OAuth callback (registered on public webhook server) ---

if (microsoftAuth.isConfigured()) {
  provider.addRoute('GET', '/auth/microsoft/callback', async (req, res) => {
    try {
      const url = new URL(req.url, `http://localhost:${config.webhookPort}`);
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const error = url.searchParams.get('error');

      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h2>Authorization cancelled.</h2><p>You can close this window and try /outlook login again in WhatsApp.</p>');
        return;
      }

      if (!code || !state) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<h2>Missing authorization code.</h2>');
        return;
      }

      const result = await microsoftAuth.handleCallback(code, state);

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<h2>Outlook connected!</h2><p>Signed in as <b>${result.email}</b>.</p><p>Outlook Mail is now available.</p><p>You can close this window and return to WhatsApp.</p>`);

      await botSendMessage(result.waId, `*Outlook connected!*\n\nSigned in as *${result.email}*.\n\nYou now have access to:\n• *Outlook Mail* — /outlook send, inbox, read\n\n\`/outlook logout\` to disconnect.`);
    } catch (e) {
      logger.error('Microsoft OAuth callback error:', e.message);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<h2>Authorization failed.</h2><p>${e.message}</p><p>Please try /outlook login again.</p>`);
    }
  });
  logger.info('Microsoft integration enabled (Outlook Mail)');
}

// --- GitHub App install callback (called by swayat.com GitHub OAuth callback) ---

const githubAuth = require('./github-auth');

if (githubAuth.isConfigured()) {
  provider.addRoute('POST', '/github/install', (req, res) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { code, state, installationId } = JSON.parse(body);
        if (!code || !state || !installationId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Missing code, state, or installationId' }));
        }

        const result = await githubAuth.handleCallback(code, state, installationId);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'connected', account: result.account }));

        // Notify user on WhatsApp
        await botSendMessage(result.waId,
          `*GitHub connected!* 🎉\n\n` +
          `Signed in as *${result.account}*.\n\n` +
          `Use \`/repos\` to see your repos and \`/repo <name>\` to start working on one.`
        );
      } catch (e) {
        logger.error('GitHub install callback error:', e.message);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  });
  logger.info('GitHub App integration enabled');
}

// --- Task recovery after restart ---

const MAX_RETRY_COUNT = 2;
const MAX_TASK_AGE_MS = 30 * 60 * 1000; // 30 minutes

async function recoverInterruptedTasks() {
  const tasks = getPendingTasks();
  const queues = getPersistedQueue();

  if (tasks.size === 0 && queues.size === 0) return;
  logger.info(`Recovery: ${tasks.size} interrupted task(s), ${queues.size} chat(s) with queued messages`);

  // Phase 1: Handle interrupted tasks
  for (const [chatId, task] of tasks) {
    const age = Date.now() - task.startedAt;

    if (age > MAX_TASK_AGE_MS) {
      // Too old — notify but don't retry
      logger.warn(`Recovery: skipping stale task for ${chatId} (age: ${Math.round(age / 60000)}m)`);
      clearPendingTask(chatId);
      await botSendMessage(chatId,
        `Hey! I had to restart and found a task from ${Math.round(age / 60000)} minutes ago that was interrupted. ` +
        `It's too old to retry automatically. Here's what it was:\n\n` +
        `_${task.prompt.slice(0, 200)}_\n\nJust send it again if you still need it.`
      ).catch(() => {});
      continue;
    }

    if ((task.retryCount || 0) >= MAX_RETRY_COUNT) {
      // Max retries reached — notify and give up
      logger.warn(`Recovery: max retries reached for ${chatId}`);
      clearPendingTask(chatId);
      await botSendMessage(chatId,
        `I've restarted ${task.retryCount + 1} times while working on your task. ` +
        `To avoid a loop, I won't retry automatically. Here's what it was:\n\n` +
        `_${task.prompt.slice(0, 200)}_\n\nPlease send it again when you're ready.`
      ).catch(() => {});
      continue;
    }

    // Notify user and retry
    await botSendMessage(chatId,
      `I just restarted and your task was interrupted. Picking it back up now...`
    ).catch(() => {});

    // Small delay to let the system stabilize
    await new Promise(r => setTimeout(r, 2000));

    const syntheticMsg = { chatId, id: null };
    handlePrompt(
      syntheticMsg, chatId, task.prompt, task.mediaPaths,
      task.senderName, task.senderId,
      { ...task.opts, _retryCount: (task.retryCount || 0) + 1 }
    );
  }

  // Phase 2: Restore queued messages
  for (const [chatId, queue] of queues) {
    if (!queue || queue.length === 0) {
      clearPersistedQueue(chatId);
      continue;
    }

    if (processing.has(chatId)) {
      // A retry is already running for this chat — add to in-memory queue
      for (const item of queue) {
        if (!messageQueue.has(chatId)) messageQueue.set(chatId, []);
        messageQueue.get(chatId).push({
          msg: { chatId: item.chatId, id: null },
          chatId: item.chatId, prompt: item.prompt, mediaPaths: item.mediaPaths,
          senderName: item.senderName, senderId: item.senderId, opts: item.opts || {},
        });
      }
    } else {
      // No active task — process the first queued item
      const first = queue.shift();
      if (first) {
        await botSendMessage(chatId,
          `I just restarted. Processing your queued message now...`
        ).catch(() => {});

        handlePrompt(
          { chatId: first.chatId, id: null }, chatId, first.prompt,
          first.mediaPaths, first.senderName, first.senderId, first.opts || {}
        );
      }
      // Push remaining items into in-memory queue
      for (const item of queue) {
        if (!messageQueue.has(chatId)) messageQueue.set(chatId, []);
        messageQueue.get(chatId).push({
          msg: { chatId: item.chatId, id: null },
          chatId: item.chatId, prompt: item.prompt, mediaPaths: item.mediaPaths,
          senderName: item.senderName, senderId: item.senderId, opts: item.opts || {},
        });
      }
    }
    clearPersistedQueue(chatId);
  }
}

// --- Provider event handlers ---

provider.on('ready', () => {
  // Initialize sandbox system
  sandbox.init();

  // Initialize scheduler with provider-based send function
  scheduler.init(provider, async (chatId, text) => {
    const sentId = await provider.sendMessage(chatId, text);
    if (sentId) {
      botSentMessageIds.add(sentId);
      setTimeout(() => botSentMessageIds.delete(sentId), 30000);
    }
  });

  // Recover interrupted tasks from previous run
  recoverInterruptedTasks();
});

provider.on('message', async (msg) => {
  const chatId = msg.chatId;
  const isGroup = msg.isGroup;

  // Check if chat is allowed
  if (!isAllowedChat(chatId)) return;

  // Skip messages the bot itself sent (via scheduler or HTTP API)
  if (msg.fromMe && botSentMessageIds.has(msg.id)) {
    botSentMessageIds.delete(msg.id);
    return;
  }

  // Skip bot-generated messages
  const msgText = msg.body || '';
  if (msgText && isBotGeneratedMessage(msgText)) return;

  // Determine if this is a message we can handle
  const isText = msg.type === 'chat';
  const hasMedia = msg.hasMedia;

  if (!isText && !hasMedia) return;

  const caption = msg.body || '';

  // For text-only messages, need some content
  if (isText && !caption) return;

  // Mark as read (Cloud API only)
  if (provider.markAsRead) {
    provider.markAsRead(msg.id).catch(() => {});
  }

  // Determine sender identity and admin status
  const senderId = msg.senderId || config.whitelistedNumber;
  const senderIsAdmin = msg.fromMe || isAdmin(senderId);

  logger.info(`Message received [${chatId}]: type=${msg.type}, fromMe=${msg.fromMe}, sender=${senderId}, admin=${senderIsAdmin}, caption="${caption.slice(0, 100)}"`);

  // Group gating: only subscribed users who are admins can interact
  if (isGroup && !msg.fromMe) {
    if (!isSubscribed(senderId) || !isAdmin(senderId)) {
      logger.info(`Ignoring group message from ${senderId} in ${chatId} (subscribed=${isSubscribed(senderId)}, admin=${isAdmin(senderId)})`);
      return;
    }
  }

  // DM gating: in non-open-access mode, require subscription
  if (!isGroup && !msg.fromMe && !config.openAccess && !isSubscribed(senderId)) {
    logger.info(`Ignoring DM from unsubscribed user ${senderId}`);
    return;
  }

  // Registration check: verify user signed up on the website
  if (!isGroup && !msg.fromMe) {
    const registered = await isRegistered(senderId);
    if (!registered) {
      logger.info(`Unregistered user ${senderId} — sending signup prompt`);
      await botSendMessage(chatId,
        `Hey there! 👋\n\n` +
        `I'm your personal AI assistant — I help you tame the chaos. Marketing, emails, scheduling, research, coding — you name it, I'm on it.\n\n` +
        `But first, I need you to sign up so I know who you are.\n\n` +
        `👉 *Sign up here:* ${SIGNUP_URL}\n\n` +
        `It takes 10 seconds. Once you're in, just come back and say hi — I'll be ready.`
      );
      return;
    }
  }

  // Welcome message for first-time users (one greeting per user, not per chat)
  if (!msg.fromMe && !isGreeted(senderId)) {
    markGreeted(senderId);
    await botSendMessage(chatId,
      `Hey! 👋\n\n` +
      `I'm your personal AI assistant — think of me as a teammate who never sleeps and loves a good challenge.\n\n` +
      `*What can I do?*\n` +
      `📝 Answer questions & write content\n` +
      `🖼️ Analyze images — send one or multiple\n` +
      `📄 Read documents — PDFs, Word, Excel\n` +
      `🎵 Transcribe audio & voice messages\n` +
      `🎬 Analyze videos\n` +
      `📧 Send emails (once connected)\n` +
      `💻 Write & run code in your own sandbox\n\n` +
      `*Handy commands:*\n` +
      `/files — See & download files from your workspace\n` +
      `/gmail login — Connect your Gmail & Google Drive\n` +
      `/resend — Set up email sending via Resend\n` +
      `/sandbox — Check your workspace status\n` +
      `/usage — See your token usage\n` +
      `/stop — Cancel a running task\n` +
      `/reset — Start fresh (clears session)\n` +
      `/help — Full command list\n\n` +
      `So, what's your first challenge? Let's go! 🚀`
    );
  }

  // Handle commands (text only)
  if (isText) {
    // Log all slash commands to activity tracker
    if (caption.startsWith('/')) {
      const parts = caption.match(/^\/(\S+)(?:\s+(.*))?$/s);
      if (parts) {
        activity.logCommand(chatId, { agentId: getUserAgent(chatId), command: parts[1].toLowerCase(), args: parts[2] || null, senderId });
      }
    }

    if (caption.toLowerCase() === '/stop' || caption.toLowerCase() === '/stop all') {
      const clearAll = caption.toLowerCase() === '/stop all';
      const qLen = getQueueLength(chatId);

      if (clearAll && qLen > 0) {
        messageQueue.delete(chatId);
      }

      if (isRunning(chatId)) {
        stopClaude(chatId);
        processing.delete(chatId);

        if (clearAll) {
          await botReply(msg, `⛔ Stopped current task and cleared queue (${qLen} pending).`);
        } else if (qLen > 0) {
          await botReply(msg, `⛔ Stopped current task. ${qLen} queued message(s) will process next.\nUse */stop all* to clear the queue too.`);
          processQueue(chatId);
        } else {
          await botReply(msg, '⛔ Stopped. Task interrupted.');
        }
      } else if (qLen > 0 && clearAll) {
        messageQueue.delete(chatId);
        await botReply(msg, `⛔ Queue cleared (${qLen} pending messages removed).`);
      } else {
        await botReply(msg, '✅ Nothing is running right now.');
      }
      return;
    }

    if (caption.toLowerCase() === '/reset') {
      if (isGroup && !senderIsAdmin) {
        await botReply(msg, '🔒 Only admins can reset the group session.');
        return;
      }
      clearSession(chatId);
      clearProjectDir(chatId);
      clearChatModel(chatId);
      clearPendingPoll(chatId);
      clearQuickReplies(chatId);
      clearPendingProjectPoll(chatId);
      resetTokenUsage(chatId);
      pendingFilePolls.delete(chatId);
      // Clear any pending media batch
      const batch = mediaBatch.get(chatId);
      if (batch && batch.timer) clearTimeout(batch.timer);
      mediaBatch.delete(chatId);
      messageQueue.delete(chatId);
      await botReply(msg, '🔄 Session, project, queue, sandbox, and usage counter cleared. Starting fresh.');
      return;
    }
    if (caption.toLowerCase() === '/status') {
      const currentModel = getChatModel(chatId) || config.claudeModel;
      const running = getRunningInfo(chatId);
      const qLen = getQueueLength(chatId);
      const history = getTaskHistory(chatId);
      let statusText = '';

      if (running) {
        const mins = Math.floor(running.elapsed / 60);
        const secs = running.elapsed % 60;
        const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
        statusText += `🔄 *Task running* (${timeStr})\n📝 _${running.prompt}_\n`;
        if (qLen > 0) statusText += `📋 *Queue:* ${qLen} message(s) waiting\n`;
        statusText += `\nModel: ${currentModel}\n\nSend /stop to interrupt.`;
      } else {
        statusText += `✅ *Idle — no task running*\nModel: ${currentModel}`;
      }
      // Show current agent
      const agentsModule = require('./agents');
      const currentAgentId = getUserAgent(chatId);
      const currentAgentDef = agentsModule.getAgent(currentAgentId);
      statusText += `\nAgent: ${currentAgentDef.icon} ${currentAgentDef.name}`;

      // Show current project name (never the full path)
      const projDir = getProjectDir(chatId);
      const projName = projDir ? path.basename(projDir) : '(default workspace)';
      statusText += `\nProject: ${projName}`;

      // Show sandbox info if enabled
      if (config.sandboxEnabled && sandbox.isBwrapAvailable()) {
        const sbStatus = sandbox.getSandboxStatus(chatId);
        statusText += `\n\n🔒 *Sandbox:* ${sbStatus.status}`;
        if (sbStatus.exists) {
          statusText += ` (${sbStatus.diskUsageMB}MB / ${sbStatus.maxDiskMB}MB)`;
        }
      }

      // Show recent task history
      if (history.length > 0) {
        statusText += `\n\n📊 *Recent tasks:*`;
        const recent = history.slice(-3).reverse();
        for (const task of recent) {
          const icon = task.status === 'completed' ? '✅' : task.status === 'stopped' ? '⛔' : '❌';
          const dur = task.durationSecs >= 60 ? `${Math.floor(task.durationSecs / 60)}m ${task.durationSecs % 60}s` : `${task.durationSecs}s`;
          let line = `\n${icon} _${task.prompt}_ (${dur})`;
          if (task.tokens) {
            line += `\n   🔤 ${task.tokens.input.toLocaleString()} in / ${task.tokens.output.toLocaleString()} out`;
          }
          statusText += line;
        }
      }

      await botReply(msg, statusText);
      return;
    }
    if (caption.toLowerCase() === '/help') {
      await botReply(msg, HELP_TEXT);
      return;
    }

    // /usage — show token usage for this chat
    if (caption.toLowerCase() === '/usage') {
      const usage = getTokenUsage(chatId);
      const total = usage.input + usage.output;
      if (usage.tasks === 0) {
        await botReply(msg, '📊 No token usage recorded for this chat yet.');
      } else {
        let usageText =
          `📊 *Token usage for this chat*\n\n` +
          `*Tokens*\n` +
          `• Input: ${usage.input.toLocaleString()}\n` +
          `• Output: ${usage.output.toLocaleString()}\n` +
          `• Cache write: ${(usage.cacheCreation || 0).toLocaleString()}\n` +
          `• Cache read: ${(usage.cacheRead || 0).toLocaleString()}\n` +
          `• Total: ${total.toLocaleString()}\n\n` +
          `*Usage*\n` +
          `• Tasks: ${usage.tasks}\n` +
          `• Cost: $${(usage.costUsd || 0).toFixed(4)}\n\n` +
          `_Counters reset on /reset_`;
        await botReply(msg, usageText);
      }
      return;
    }

    // /agents — list available agents
    if (caption.toLowerCase() === '/agents') {
      const agentsModule = require('./agents');
      const currentAgent = getUserAgent(chatId);
      await botReply(msg, agentsModule.formatAgentList(currentAgent));
      return;
    }

    // /agent <name> — switch to a different agent
    const agentMatch = caption.match(/^\/agent\s+(.+)$/i);
    if (agentMatch) {
      const agentsModule = require('./agents');
      const input = agentMatch[1].trim();
      const agent = agentsModule.resolveAgent(input);

      if (!agent) {
        await botReply(msg, `❌ Unknown agent: _${input}_\n\nUse /agents to see available agents.`);
        return;
      }

      const currentAgent = getUserAgent(chatId);
      if (agent.id === currentAgent) {
        await botReply(msg, `You're already using ${agent.icon} *${agent.name}*.`);
        return;
      }

      // Stop any running task before switching
      if (isRunning(chatId)) {
        stopClaude(chatId);
        processing.delete(chatId);
      }

      // Switch agent (session is preserved per agent, auto-resumes when switching back)
      setUserAgent(chatId, agent.id);
      clearProjectDir(chatId); // Reset project dir so agent workspace is used

      let reply = `Switched to ${agent.icon} *${agent.name}*`;
      if (agent.welcome) {
        reply += `\n\n${agent.welcome}`;
      }
      await botReply(msg, reply);
      return;
    }

    // /sandbox [clean|reset] — sandbox status and management
    const sandboxMatch = caption.match(/^\/sandbox(?:\s+(clean|reset))?$/i);
    if (sandboxMatch) {
      if (!config.sandboxEnabled || !sandbox.isBwrapAvailable()) {
        await botReply(msg, '🔒 Sandbox is not enabled or bwrap is unavailable.');
        return;
      }
      const action = sandboxMatch[1] ? sandboxMatch[1].toLowerCase() : null;

      if (action === 'clean') {
        const removed = sandbox.cleanWorkspace(chatId);
        await botReply(msg, `🧹 Cleaned sandbox workspace: ${removed} item(s) removed.\n_CLAUDE.md preserved._`);
        return;
      }

      if (action === 'reset') {
        if (!senderIsAdmin && !msg.fromMe) {
          await botReply(msg, '🔒 Only admins can reset sandboxes.');
          return;
        }
        await botReply(msg, '🔒 Sandbox workspace reset. A fresh one will be created on next message.');
        return;
      }

      // Default: show status
      const status = sandbox.getSandboxStatus(chatId);
      let text = `🔒 *Sandbox Status*\n\n`;
      text += `Status: ${status.status}\n`;
      text += `Disk: ${status.diskUsageMB}MB / ${status.maxDiskMB}MB\n`;
      if (status.diskUsageMB > status.maxDiskMB) {
        text += `⚠️ *Over disk limit!* Use /sandbox clean\n`;
      }
      text += `\n_Commands: /sandbox clean, /sandbox reset_`;
      await botReply(msg, text);
      return;
    }

    // /subscribe <number> — add subscription (admin only)
    const subscribeMatch = caption.match(/^\/subscribe\s+(\S+)/i);
    if (subscribeMatch) {
      if (!senderIsAdmin) {
        await botReply(msg, '🔒 Only admins can manage subscriptions.');
        return;
      }
      const num = subscribeMatch[1].includes('@') ? subscribeMatch[1] : `${subscribeMatch[1]}@c.us`;
      addSubscription(num);
      await botReply(msg, `✅ Subscription added for ${num.replace('@c.us', '')}`);
      return;
    }

    // /unsubscribe <number> — remove subscription (admin only)
    const unsubscribeMatch = caption.match(/^\/unsubscribe\s+(\S+)/i);
    if (unsubscribeMatch) {
      if (!senderIsAdmin) {
        await botReply(msg, '🔒 Only admins can manage subscriptions.');
        return;
      }
      const num = unsubscribeMatch[1].includes('@') ? unsubscribeMatch[1] : `${unsubscribeMatch[1]}@c.us`;
      removeSubscription(num);
      await botReply(msg, `⛔ Subscription removed for ${num.replace('@c.us', '')}`);
      return;
    }

    // /subscribers — list subscribed users (admin only)
    if (caption.toLowerCase() === '/subscribers') {
      if (!senderIsAdmin) {
        await botReply(msg, '🔒 Only admins can view subscribers.');
        return;
      }
      const subs = getSubscribedUsers();
      if (subs.length === 0) {
        await botReply(msg, '📋 No subscribed users yet.\nUse `/subscribe <number>` to add one.');
      } else {
        const list = subs.map((s, i) => `${i + 1}. ${s.replace('@c.us', '')}`).join('\n');
        await botReply(msg, `📋 *Subscribed users (${subs.length}):*\n\n${list}`);
      }
      return;
    }

    // /isolate — give this group its own sandbox
    if (caption.toLowerCase() === '/isolate') {
      if (!isGroup) {
        await botReply(msg, '🐳 /isolate is only for group chats. Your DM already has its own sandbox.');
        return;
      }
      if (isIsolatedGroup(chatId)) {
        await botReply(msg, '🐳 This group is already isolated with its own sandbox.');
        return;
      }
      setIsolatedGroup(chatId);
      clearSession(chatId);
      await botReply(msg, '🐳 Group isolated! This group now has its own separate sandbox.\nSession reset for fresh start.');
      return;
    }

    // /unisolate — merge group back to user's personal sandbox
    if (caption.toLowerCase() === '/unisolate') {
      if (!isGroup) {
        await botReply(msg, '🔒 /unisolate is only for group chats.');
        return;
      }
      if (!isIsolatedGroup(chatId)) {
        await botReply(msg, '🔒 This group already shares your personal sandbox.');
        return;
      }
      removeIsolatedGroup(chatId);
      clearSession(chatId);
      await botReply(msg, '🐳 Group merged back to your personal sandbox.\nSession reset for fresh start.');
      return;
    }

    // /register <name> [email] — create/update user profile
    const registerMatch = caption.match(/^\/register\s+(\S+)(?:\s+(\S+))?/i);
    if (registerMatch) {
      const regSenderId = msg.senderId || config.whitelistedNumber;
      const displayName = registerMatch[1];
      const email = registerMatch[2] || null;
      const profile = registerUser(regSenderId, displayName, email);
      await botReply(msg,
        `✅ *Profile saved!*\n\n` +
        `👤 Name: ${profile.displayName}\n` +
        (profile.email ? `📧 Email: ${profile.email}\n` : '') +
        `📱 WA: ${regSenderId.replace('@c.us', '')}\n\n` +
        `Use /profile to view your profile.`
      );
      return;
    }

    // /profile [number] — show user profile card
    const profileMatch = caption.match(/^\/profile(?:\s+(\S+))?/i);
    if (profileMatch) {
      const targetArg = profileMatch[1];
      const profSenderId = msg.senderId || config.whitelistedNumber;

      let targetId;
      if (targetArg) {
        if (!isAdmin(profSenderId) && !msg.fromMe) {
          await botReply(msg, '🔒 Only admins can view other users\' profiles.');
          return;
        }
        targetId = targetArg.includes('@') ? targetArg : `${targetArg}@c.us`;
      } else {
        targetId = profSenderId;
      }

      const profile = getProfile(targetId);
      if (!profile) {
        await botReply(msg, `👤 No profile found for ${targetId.replace('@c.us', '')}.\nUse /register <name> to create one.`);
        return;
      }
      const usage = getTokenUsage(chatId);
      await botReply(msg, formatProfileCard(profile, usage));
      return;
    }

    // /imagine <prompt> — generate an image via DALL-E 3 (TASK-003)
    const imagineMatch = caption.match(/^\/imagine\s+(.+)/i);
    if (imagineMatch) {
      if (!apiCommands.isCommandEnabled(chatId, 'imagine')) {
        await botReply(msg, '🔒 /imagine is disabled for this chat.');
        return;
      }
      const prompt = imagineMatch[1].trim();
      await botReply(msg, '🎨 Generating image...');
      try {
        const MEDIA_DIR = path.join(__dirname, '..', 'media_tmp');
        const imageUrl = await apiCommands.imagine(prompt);
        const localPath = await apiCommands.downloadImageToTemp(imageUrl, MEDIA_DIR);
        await provider.replyWithMedia(msg, localPath, { caption: `🎨 _${prompt}_` });
        try { fs.unlinkSync(localPath); } catch {}
      } catch (e) {
        await botReply(msg, `❌ Image generation failed: ${e.message}`);
      }
      return;
    }

    // /files — list files in the workspace (sandbox-only for security)
    if (caption.toLowerCase() === '/files') {
      if (!config.sandboxEnabled || !sandbox.isBwrapAvailable()) {
        await botReply(msg, '📂 Your session is not active yet. Send me a message first and I\'ll set up your workspace.');
        return;
      }
      const sbStatus = sandbox.getSandboxStatus(chatId);
      const workspaceDir = sbStatus.workspaceDir;

      let entries = [];
      try {
        entries = fs.readdirSync(workspaceDir)
          .map(name => ({ name, fullPath: path.join(workspaceDir, name) }))
          .filter(e => fs.statSync(e.fullPath).isFile());
      } catch (e) {
        await botReply(msg, `📂 No files found (${e.message})`);
        return;
      }

      if (entries.length === 0) {
        await botReply(msg, '📂 No files in your workspace yet.');
        return;
      }

      pendingFilePolls.set(chatId, { files: entries });

      const fileList = entries.map((e, i) => {
        const stat = fs.statSync(e.fullPath);
        const size = stat.size > 1048576
          ? `${(stat.size / 1048576).toFixed(1)}MB`
          : `${Math.round(stat.size / 1024)}KB`;
        return `${i + 1}. ${e.name} (${size})`;
      }).join('\n');

      await botReply(msg, `📂 *Files in your workspace (${entries.length}):*\n\n${fileList}\n\n_Reply with a number to download, or send the file to Drive._`);
      return;
    }

    // /enable <command> / /disable <command> — admin toggle API commands (TASK-003)
    const enableMatch = caption.match(/^\/(enable|disable)\s+(\S+)/i);
    if (enableMatch) {
      if (!senderIsAdmin) {
        await botReply(msg, '🔒 Only admins can enable/disable commands.');
        return;
      }
      const action = enableMatch[1].toLowerCase();
      const command = enableMatch[2].toLowerCase();
      if (!apiCommands.COMMAND_KEYS[command]) {
        await botReply(msg, `❌ Unknown command: ${command}\nAvailable: ${Object.keys(apiCommands.COMMAND_KEYS).join(', ')}`);
        return;
      }
      if (action === 'enable') {
        apiCommands.enableCommand(chatId, command);
        await botReply(msg, `✅ /${command} enabled for this chat.`);
      } else {
        apiCommands.disableCommand(chatId, command);
        await botReply(msg, `⛔ /${command} disabled for this chat.`);
      }
      return;
    }

    // /drive — list files uploaded to this group's Google Drive folder
    if (caption.toLowerCase() === '/drive') {
      if (!drive.isConfigured()) {
        await botReply(msg, '❌ Google Drive is not configured. Set up Google OAuth in .env.');
        return;
      }
      const driveSenderId = senderId || config.whitelistedNumber;
      const driveStatus = googleAuth.getStatus(driveSenderId);
      if (!driveStatus.connected) {
        await botReply(msg, '❌ Google not connected. Use `/gmail login` to connect your Google account (includes Drive access).');
        return;
      }
      await botReply(msg, '🔍 Fetching Drive files...');
      try {
        const files = await drive.listFiles(driveSenderId, chatId);
        if (typeof files === 'string') {
          await botReply(msg, `❌ ${files}`);
        } else if (files.length === 0) {
          await botReply(msg, '📁 No files uploaded to Drive for this chat yet.');
        } else {
          const lines = files.map(f =>
            `📄 *${f.name}*\n   ${f.size} · ${new Date(f.modifiedTime).toLocaleDateString()}\n   ${f.link}`
          ).join('\n\n');
          await botSendChunks(msg, `📁 *Drive files:*\n\n${lines}`);
        }
      } catch (e) {
        await botReply(msg, `❌ Drive error: ${e.message}`);
      }
      return;
    }

    // /gmail [status|login|logout|send|inbox|read] — Gmail integration
    const gmailMatch = caption.match(/^\/gmail(?:\s+(.*))?$/is);
    if (gmailMatch) {
      if (!googleAuth.isConfigured()) {
        await botReply(msg, '❌ Google is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI in .env.');
        return;
      }

      const gmailSenderId = senderId || config.whitelistedNumber;
      const rawArgs = (gmailMatch[1] || '').trim();
      const subcommand = rawArgs.toLowerCase().split(/\s+/)[0] || '';

      // /gmail or /gmail status
      if (!subcommand || subcommand === 'status') {
        const status = googleAuth.getStatus(gmailSenderId);
        if (status.connected) {
          await botReply(msg, `*Google connected*\n\nSigned in as *${status.email}*\nConnected: ${new Date(status.connectedAt).toLocaleDateString()}\n\nGmail commands:\n\`/gmail send <to> <subject> | <body>\`\n\`/gmail inbox [query]\`\n\`/gmail read <id>\`\n\`/gmail logout\`\n\nAlso available: /drive, Docs & Sheets via AI`);
        } else {
          await botReply(msg, `*Google not connected*\n\nUse \`/gmail login\` to connect your Google account (Gmail, Drive, Docs, Sheets).`);
        }
        return;
      }

      // /gmail login
      if (subcommand === 'login') {
        const authUrl = googleAuth.getAuthUrl(gmailSenderId);
        await botReply(msg, `*Connect your Google account*\n\nTap the link below to authorize:\n${authUrl}\n\n_This grants access to Gmail, Drive, Docs & Sheets._\n_Link expires in 10 minutes._`);
        return;
      }

      // /gmail logout
      if (subcommand === 'logout') {
        googleAuth.removeUserTokens(gmailSenderId);
        await botReply(msg, 'Google disconnected. Your tokens have been removed.\n\nThis also disconnects Drive, Docs & Sheets access.');
        return;
      }

      // /gmail send <to> <subject> | <body>
      const sendMatch = rawArgs.match(/^send\s+(\S+)\s+(.+?)\s*\|\s*(.+)/is);
      if (sendMatch) {
        const [, to, subject, body] = sendMatch;
        await botReply(msg, 'Sending email...');
        try {
          const result = await googleAuth.sendEmail(gmailSenderId, to.trim(), subject.trim(), body.trim());
          await botReply(msg, `*Email sent!*\n\nFrom: ${result.from}\nTo: ${result.to}\nSubject: ${result.subject}`);
        } catch (e) {
          await botReply(msg, `❌ Failed to send email: ${e.message}`);
        }
        return;
      }

      // /gmail inbox [query]
      if (subcommand === 'inbox') {
        const query = rawArgs.replace(/^inbox\s*/i, '').trim() || null;
        await botReply(msg, 'Fetching emails...');
        try {
          const emails = await googleAuth.listEmails(gmailSenderId, query, 10);
          if (emails.length === 0) {
            await botReply(msg, 'No emails found.');
          } else {
            const lines = emails.map((e, i) =>
              `*${i + 1}.* ${e.subject || '(no subject)'}\n   From: ${e.from}\n   ${e.date}\n   ID: \`${e.id}\``
            ).join('\n\n');
            await botSendChunks(msg, `*Inbox${query ? ` — "${query}"` : ''}:*\n\n${lines}\n\n_Use \`/gmail read <id>\` to read an email._`);
          }
        } catch (e) {
          await botReply(msg, `❌ Failed to fetch emails: ${e.message}`);
        }
        return;
      }

      // /gmail read <messageId>
      if (subcommand === 'read') {
        const messageId = rawArgs.replace(/^read\s*/i, '').trim();
        if (!messageId) {
          await botReply(msg, 'Usage: `/gmail read <message-id>`\n\nGet message IDs from `/gmail inbox`.');
          return;
        }
        try {
          const email = await googleAuth.getEmail(gmailSenderId, messageId);
          const text = [
            `*${email.subject || '(no subject)'}*`,
            `From: ${email.from}`,
            `To: ${email.to}`,
            `Date: ${email.date}`,
            '',
            email.body || '(empty)',
          ].join('\n');
          await botSendChunks(msg, text);
        } catch (e) {
          await botReply(msg, `❌ Failed to read email: ${e.message}`);
        }
        return;
      }

      // Unknown subcommand — show help
      await botReply(msg, `*Gmail commands:*\n\n\`/gmail\` — Connection status\n\`/gmail login\` — Connect Google account\n\`/gmail logout\` — Disconnect\n\`/gmail send <to> <subject> | <body>\` — Send email\n\`/gmail inbox [query]\` — List/search emails\n\`/gmail read <id>\` — Read an email`);
      return;
    }

    // /outlook [status|login|logout|send|inbox|read] — Outlook integration
    const outlookMatch = caption.match(/^\/outlook(?:\s+(.*))?$/is);
    if (outlookMatch) {
      if (!microsoftAuth.isConfigured()) {
        await botReply(msg, '❌ Outlook is not configured. Set MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, and MICROSOFT_REDIRECT_URI in .env.');
        return;
      }

      const outlookSenderId = senderId || config.whitelistedNumber;
      const rawArgs = (outlookMatch[1] || '').trim();
      const subcommand = rawArgs.toLowerCase().split(/\s+/)[0] || '';

      // /outlook or /outlook status
      if (!subcommand || subcommand === 'status') {
        const status = microsoftAuth.getStatus(outlookSenderId);
        if (status.connected) {
          await botReply(msg, `*Outlook connected*\n\nSigned in as *${status.email}*\nConnected: ${new Date(status.connectedAt).toLocaleDateString()}\n\nOutlook commands:\n\`/outlook send <to> <subject> | <body>\`\n\`/outlook inbox [query]\`\n\`/outlook read <id>\`\n\`/outlook logout\``);
        } else {
          await botReply(msg, `*Outlook not connected*\n\nUse \`/outlook login\` to connect your Microsoft account.`);
        }
        return;
      }

      // /outlook login
      if (subcommand === 'login') {
        const authUrl = microsoftAuth.getAuthUrl(outlookSenderId);
        await botReply(msg, `*Connect your Outlook account*\n\nTap the link below to authorize:\n${authUrl}\n\n_This grants access to Outlook Mail._\n_Link expires in 10 minutes._`);
        return;
      }

      // /outlook logout
      if (subcommand === 'logout') {
        microsoftAuth.removeUserTokens(outlookSenderId);
        await botReply(msg, 'Outlook disconnected. Your tokens have been removed.');
        return;
      }

      // /outlook send <to> <subject> | <body>
      const sendMatch = rawArgs.match(/^send\s+(\S+)\s+(.+?)\s*\|\s*(.+)/is);
      if (sendMatch) {
        const [, to, subject, body] = sendMatch;
        await botReply(msg, 'Sending email...');
        try {
          const result = await microsoftAuth.sendEmail(outlookSenderId, to.trim(), subject.trim(), body.trim());
          await botReply(msg, `*Email sent!*\n\nFrom: ${result.from}\nTo: ${result.to}\nSubject: ${result.subject}`);
        } catch (e) {
          await botReply(msg, `❌ Failed to send email: ${e.message}`);
        }
        return;
      }

      // /outlook inbox [query]
      if (subcommand === 'inbox') {
        const query = rawArgs.replace(/^inbox\s*/i, '').trim() || null;
        await botReply(msg, 'Fetching emails...');
        try {
          const emails = await microsoftAuth.listEmails(outlookSenderId, query, 10);
          if (emails.length === 0) {
            await botReply(msg, 'No emails found.');
          } else {
            const lines = emails.map((e, i) =>
              `*${i + 1}.* ${e.subject || '(no subject)'}\n   From: ${e.from}\n   ${e.date}\n   ID: \`${e.id}\``
            ).join('\n\n');
            await botSendChunks(msg, `*Inbox${query ? ` — "${query}"` : ''}:*\n\n${lines}\n\n_Use \`/outlook read <id>\` to read an email._`);
          }
        } catch (e) {
          await botReply(msg, `❌ Failed to fetch emails: ${e.message}`);
        }
        return;
      }

      // /outlook read <messageId>
      if (subcommand === 'read') {
        const messageId = rawArgs.replace(/^read\s*/i, '').trim();
        if (!messageId) {
          await botReply(msg, 'Usage: `/outlook read <message-id>`\n\nGet message IDs from `/outlook inbox`.');
          return;
        }
        try {
          const email = await microsoftAuth.getEmail(outlookSenderId, messageId);
          const text = [
            `*${email.subject || '(no subject)'}*`,
            `From: ${email.from}`,
            `To: ${email.to}`,
            `Date: ${email.date}`,
            '',
            email.body || '(empty)',
          ].join('\n');
          await botSendChunks(msg, text);
        } catch (e) {
          await botReply(msg, `❌ Failed to read email: ${e.message}`);
        }
        return;
      }

      // Unknown subcommand — show help
      await botReply(msg, `*Outlook commands:*\n\n\`/outlook\` — Connection status\n\`/outlook login\` — Connect Microsoft account\n\`/outlook logout\` — Disconnect\n\`/outlook send <to> <subject> | <body>\` — Send email\n\`/outlook inbox [query]\` — List/search emails\n\`/outlook read <id>\` — Read an email`);
      return;
    }

    // /resend [status|setup|disconnect] — Resend email integration
    const resendMatch = caption.match(/^\/resend(?:\s+(.*))?$/is);
    if (resendMatch) {
      const resendSenderId = senderId || config.whitelistedNumber;
      const rawArgs = (resendMatch[1] || '').trim();
      const subcommand = rawArgs.toLowerCase().split(/\s+/)[0] || '';

      // /resend or /resend status
      if (!subcommand || subcommand === 'status') {
        const status = resendAuth.getStatus(resendSenderId);
        if (status.connected) {
          await botReply(msg, `*Resend connected*\n\nConnected: ${new Date(status.connectedAt).toLocaleDateString()}\n\nYou can ask your AI assistant to send emails, manage domains, and more using Resend.\n\n\`/resend disconnect\` to remove your API key.`);
        } else {
          await botReply(msg,
            `*Resend — Setup Guide*\n\n` +
            `1. Go to resend.com and create a free account\n` +
            `2. Verify your domain: Settings > Domains > Add Domain\n` +
            `   _(add the DNS records Resend gives you)_\n` +
            `3. Create an API key: Settings > API Keys > Create\n` +
            `4. Send your key here:\n\n` +
            `\`/resend setup re_your_key_here\`\n\n` +
            `_Free tier: 100 emails/day, 3,000/month._`
          );
        }
        return;
      }

      // /resend setup <api-key>
      if (subcommand === 'setup') {
        const apiKey = rawArgs.replace(/^setup\s*/i, '').trim();
        if (!apiKey || !apiKey.startsWith('re_')) {
          await botReply(msg, 'Usage: `/resend setup re_your_api_key`\n\nGet your API key from resend.com > Settings > API Keys.');
          return;
        }
        await botReply(msg, 'Validating API key...');
        const result = await resendAuth.validateKey(apiKey);
        if (!result.valid) {
          await botReply(msg, `Invalid API key: ${result.error}\n\nPlease check the key and try again.`);
          return;
        }
        resendAuth.setUserKey(resendSenderId, {
          apiKey,
          connectedAt: new Date().toISOString(),
        });
        const domainList = result.domains.length > 0
          ? result.domains.map(d => `  - ${d.name} (${d.status})`).join('\n')
          : '  _(no domains yet — add one at resend.com)_';
        await botReply(msg, `*Resend connected!*\n\nYour domains:\n${domainList}\n\nYou can now ask your AI assistant to send emails, manage domains, and more.\n\n\`/resend disconnect\` to remove your API key.`);
        return;
      }

      // /resend disconnect
      if (subcommand === 'disconnect') {
        resendAuth.removeUserKey(resendSenderId);
        await botReply(msg, 'Resend disconnected. Your API key has been removed.');
        return;
      }

      // Unknown subcommand — show help
      await botReply(msg, `*Resend commands:*\n\n\`/resend\` — Setup guide / connection status\n\`/resend setup <api-key>\` — Connect your Resend account\n\`/resend status\` — Check connection\n\`/resend disconnect\` — Remove API key`);
      return;
    }

    // /github [status|disconnect] — GitHub App integration
    const githubMatch = caption.match(/^\/github(?:\s+(.*))?$/is);
    if (githubMatch) {
      if (!githubAuth.isConfigured()) {
        await botReply(msg, 'GitHub integration is not configured on this bot.');
        return;
      }
      const subcommand = (githubMatch[1] || '').trim().toLowerCase();
      const ghSenderId = isGroup ? senderId : chatId;

      // /github or /github status
      if (!subcommand || subcommand === 'status') {
        const status = githubAuth.getStatus(ghSenderId);
        if (status.connected) {
          await botReply(msg, `*GitHub connected*\n\nAccount: *${status.account}*\nConnected: ${new Date(status.connectedAt).toLocaleDateString()}\n\nUse \`/repos\` to list repos\nUse \`/repo <name>\` to set active repo\n\`/github disconnect\` to remove`);
        } else {
          const url = githubAuth.getInstallUrl(ghSenderId);
          await botReply(msg, `*Connect your GitHub repos*\n\nClick the link below to install the Swayat AI app on your GitHub account. You'll choose which repos to give access to.\n\n${url}\n\nAfter installing, come back here and use \`/repos\` to see your repos.`);
        }
        return;
      }

      // /github disconnect
      if (subcommand === 'disconnect') {
        githubAuth.removeInstallation(ghSenderId);
        await botReply(msg, 'GitHub disconnected. You can reconnect anytime with `/github`.');
        return;
      }

      // Unknown
      await botReply(msg, `*GitHub commands:*\n\n\`/github\` — Connect or check status\n\`/repos\` — List connected repos\n\`/repo <name>\` — Set active repo\n\`/github disconnect\` — Remove connection`);
      return;
    }

    // /repos — list connected GitHub repos
    if (caption.toLowerCase() === '/repos') {
      if (!githubAuth.isConfigured()) {
        await botReply(msg, 'GitHub integration is not configured.');
        return;
      }
      const ghSenderId = isGroup ? senderId : chatId;
      const status = githubAuth.getStatus(ghSenderId);
      if (!status.connected) {
        await botReply(msg, 'GitHub not connected. Use `/github` to connect your repos.');
        return;
      }
      try {
        const repos = await githubAuth.listRepos(ghSenderId);
        if (repos.length === 0) {
          await botReply(msg, 'No repos found. You may need to update your GitHub App permissions to include repos.');
          return;
        }
        let text = `*Your GitHub repos (${repos.length}):*\n\n`;
        repos.forEach((r, i) => {
          text += `${i + 1}. *${r.name}* ${r.private ? '🔒' : '🌐'}\n   ${r.fullName}\n\n`;
        });
        text += `Set active repo: \`/repo <name>\``;
        await botReply(msg, text);
      } catch (e) {
        await botReply(msg, `Failed to list repos: ${e.message}`);
      }
      return;
    }

    // /repo <name> — clone and set active repo
    const repoMatch = caption.match(/^\/repo\s+(.+)$/i);
    if (repoMatch) {
      if (!githubAuth.isConfigured()) {
        await botReply(msg, 'GitHub integration is not configured.');
        return;
      }
      const ghSenderId = isGroup ? senderId : chatId;
      const status = githubAuth.getStatus(ghSenderId);
      if (!status.connected) {
        await botReply(msg, 'GitHub not connected. Use `/github` to connect your repos.');
        return;
      }

      const input = repoMatch[1].trim().toLowerCase();
      try {
        const repos = await githubAuth.listRepos(ghSenderId);
        const match = repos.find(r =>
          r.name.toLowerCase() === input ||
          r.fullName.toLowerCase() === input ||
          r.name.toLowerCase().includes(input)
        );
        if (!match) {
          await botReply(msg, `Repo "${repoMatch[1].trim()}" not found. Use \`/repos\` to see available repos.`);
          return;
        }

        await botReply(msg, `Cloning *${match.fullName}*...`);

        // Clone into agent workspace
        const { execFileSync } = require('child_process');
        const agentId = getUserAgent(chatId);
        const sandboxKey = getSandboxKey(chatId, senderId);
        const { base } = sandbox.ensureSandboxDirs(sandboxKey);
        const agents = require('./agents');
        const workspace = agents.ensureAgentWorkspace(base, agentId);
        const repoDir = path.join(workspace, match.name);

        const cloneUrl = await githubAuth.getCloneUrl(ghSenderId, match.fullName);

        if (fs.existsSync(repoDir)) {
          // Repo already cloned — pull latest
          const { token } = await githubAuth.generateInstallationToken(ghSenderId);
          execFileSync('git', ['remote', 'set-url', 'origin', cloneUrl], { cwd: repoDir });
          execFileSync('git', ['pull', '--ff-only'], { cwd: repoDir, timeout: 60000 });
          await botReply(msg, `Pulled latest for *${match.fullName}*. Repo is ready.`);
        } else {
          execFileSync('git', ['clone', '--depth', '1', cloneUrl, repoDir], { timeout: 120000 });
          await botReply(msg, `Cloned *${match.fullName}* (${match.defaultBranch} branch).`);
        }

        // Set as active project dir
        setProjectDir(chatId, repoDir);

        // Write git credentials for Claude to push
        const { token } = await githubAuth.generateInstallationToken(ghSenderId);
        const credPath = path.join(repoDir, '.git-credentials');
        fs.writeFileSync(credPath, `https://x-access-token:${token}@github.com\n`, { mode: 0o600 });
        execFileSync('git', ['config', 'credential.helper', `store --file=${credPath}`], { cwd: repoDir });
        execFileSync('git', ['config', 'user.name', 'Swayat AI'], { cwd: repoDir });
        execFileSync('git', ['config', 'user.email', 'bot@swayat.com'], { cwd: repoDir });

        await botReply(msg, `*${match.name}* is now your active repo. I can edit files, commit, and push changes.\n\nJust tell me what to do!`);
      } catch (e) {
        logger.error('Repo clone error:', e.message);
        await botReply(msg, `Failed to set up repo: ${e.message}`);
      }
      return;
    }

    // /model [name] — view or set the Claude model for this chat (admin-only in groups)
    const modelMatch = caption.match(/^\/model(?:\s+(.+))?$/i);
    if (modelMatch) {
      if (isGroup && !senderIsAdmin) {
        await botReply(msg, '🔒 Only admins can change the model.');
        return;
      }
      const newModel = modelMatch[1] ? modelMatch[1].trim() : null;
      if (!newModel) {
        const current = getChatModel(chatId) || config.claudeModel;
        await botReply(msg, `🤖 Current model: *${current}*\n\nUsage: /model <name>\nExamples:\n\`/model sonnet\`\n\`/model opus\`\n\`/model haiku\`\n\`/model claude-sonnet-4-6\`\n\`/model reset\` — revert to default`);
        return;
      }
      if (newModel.toLowerCase() === 'reset' || newModel.toLowerCase() === 'default') {
        clearChatModel(chatId);
        await botReply(msg, `🤖 Model reset to default: *${config.claudeModel}*`);
        return;
      }
      const MODEL_ALIASES = { opus: 'claude-opus-4-6', sonnet: 'claude-sonnet-4-6', haiku: 'claude-haiku-4-5-20251001' };
      const resolved = MODEL_ALIASES[newModel.toLowerCase()] || newModel;
      setChatModel(chatId, resolved);
      await botReply(msg, `🤖 Model set to *${resolved}* for this chat.`);
      return;
    }

    // /schedule <cron|every interval> <prompt> (admin-only in groups)
    const scheduleMatch = caption.match(/^\/schedule\s+(.+)/i);
    if (scheduleMatch) {
      if (isGroup && !senderIsAdmin) {
        await botReply(msg, '🔒 Only admins can manage schedules in a group.');
        return;
      }
      const parsed = scheduler.parseScheduleCommand(scheduleMatch[1]);
      if (!parsed) {
        await botReply(msg, '❌ Invalid schedule format.\n\nExamples:\n`/schedule every 30m check server status`\n`/schedule every 6h run tests`\n`/schedule */30 * * * * check logs`');
        return;
      }
      const task = scheduler.createSchedule(chatId, parsed.cron, parsed.prompt, parsed.friendly);
      await botReply(msg, `⏰ Scheduled: *${parsed.friendly}*\nPrompt: _${parsed.prompt}_\nID: \`${task.id}\`\n\nUse /schedules to list, /unschedule ${task.id} to remove.`);
      return;
    }

    // /schedules — list scheduled tasks
    if (caption.toLowerCase() === '/schedules') {
      const tasks = scheduler.listSchedules(chatId);
      if (tasks.length === 0) {
        await botReply(msg, '📋 No scheduled tasks for this chat.');
        return;
      }
      let text = `⏰ *Scheduled tasks (${tasks.length}):*\n`;
      for (const t of tasks) {
        const lastRun = t.lastRun ? new Date(t.lastRun).toLocaleString() : 'never';
        const statusIcon = t.lastStatus === 'completed' ? '✅' : t.lastStatus === 'error' ? '❌' : '⏳';
        text += `\n${statusIcon} \`${t.id}\`\n   ${t.friendlyInterval || t.cron}\n   _${t.prompt}_\n   Last run: ${lastRun}\n`;
      }
      text += `\nUse /unschedule <id> or /unschedule all`;
      await botSendChunks(msg, text);
      return;
    }

    // /unschedule <id|all> (admin-only in groups)
    const unschedMatch = caption.match(/^\/unschedule\s+(.+)/i);
    if (unschedMatch) {
      if (isGroup && !senderIsAdmin) {
        await botReply(msg, '🔒 Only admins can manage schedules in a group.');
        return;
      }
      const arg = unschedMatch[1].trim();
      if (arg.toLowerCase() === 'all') {
        const count = scheduler.removeAllSchedules(chatId);
        await botReply(msg, `⏰ Removed all ${count} scheduled task(s).`);
      } else {
        scheduler.removeSchedule(arg, chatId);
        await botReply(msg, `⏰ Removed schedule \`${arg}\`.`);
      }
      return;
    }

    // /project and /projects — disabled (users work within their own workspace only)
    if (caption.match(/^\/projects?\b/i)) {
      await botReply(msg, 'This command is not available. Your workspace is set up automatically.');
      return;
    }

    // Check for quick reply (number tap)
    const numMatch = caption.match(/^(\d{1,3})$/);
    if (numMatch) {
      const idx = parseInt(numMatch[1], 10) - 1;

      // Check if this is a file selection (TASK-005)
      const filePoll = pendingFilePolls.get(chatId);
      if (filePoll && idx >= 0 && idx < filePoll.files.length) {
        pendingFilePolls.delete(chatId);
        const { name, fullPath } = filePoll.files[idx];
        const stat = fs.statSync(fullPath);
        const WA_MAX_BYTES = 16 * 1024 * 1024; // 16MB WhatsApp limit

        if (stat.size > WA_MAX_BYTES) {
          const fileUploadSenderId = senderId || config.whitelistedNumber;
          const driveConnected = googleAuth.getStatus(fileUploadSenderId).connected;
          if (drive.isConfigured() && driveConnected) {
            await botReply(msg, `📤 File too large for WhatsApp (${(stat.size / 1048576).toFixed(1)}MB). Uploading to Drive...`);
            try {
              const link = await drive.uploadFile(fileUploadSenderId, chatId, chatId, fullPath);
              await botReply(msg, `✅ *${name}* uploaded to Drive:\n${link}`);
            } catch (e) {
              await botReply(msg, `❌ Drive upload failed: ${e.message}`);
            }
          } else {
            await botReply(msg, `⚠️ File is ${(stat.size / 1048576).toFixed(1)}MB — too large for WhatsApp. Use \`/gmail login\` to enable Drive uploads.`);
          }
        } else {
          await botReply(msg, `📤 Sending *${name}*...`);
          try {
            await provider.replyWithMedia(msg, fullPath, { sendMediaAsDocument: true });
          } catch (e) {
            await botReply(msg, `❌ Failed to send file: ${e.message}`);
          }
        }
        return;
      }

      // Check if this is a project selection
      const projPoll = getPendingProjectPoll(chatId);
      if (projPoll) {
        if (idx >= 0 && idx < projPoll.dirs.length) {
          const dir = projPoll.dirs[idx];
          try {
            setProjectDir(chatId, dir);
            clearSession(chatId);
            clearPendingProjectPoll(chatId);
            clearQuickReplies(chatId);
            await botReply(msg, `📂 Project set: *${path.basename(dir)}*\n\nSession reset. Send a message to start working!`);
          } catch (e) {
            await botReply(msg, `❌ ${e.message}`);
          }
          return;
        }
      }

      // Otherwise check Claude options quick reply
      const qr = getQuickReplies(chatId);
      if (qr) {
        if (idx >= 0 && idx < qr.length) {
          const selectedOption = qr[idx];
          logger.info(`Quick reply selected: ${idx + 1}. ${selectedOption}`);
          clearQuickReplies(chatId);
          clearPendingPoll(chatId);
          await handlePrompt(msg, chatId, `I choose: ${selectedOption}`, null, senderName, senderId);
          return;
        }
      }
    }
  }

  // Resolve sender name for this message
  let senderName = config.botName;
  if (isGroup && !msg.fromMe) {
    const contactInfo = await provider.getContactFromMessage(msg);
    if (contactInfo) {
      senderName = contactInfo.pushname || contactInfo.shortName || contactInfo.name || 'Unknown';
    }
    ensureProfile(senderId, senderName);
  } else if (!msg.fromMe && msg.pushName) {
    senderName = msg.pushName;
    ensureProfile(senderId, senderName);
  }

  // Media messages: batch multiple rapid-fire media into one prompt
  if (hasMedia) {
    const batch = mediaBatch.get(chatId) || { msgs: [], timer: null, firstMsg: null, caption: '', senderId, senderName };
    batch.msgs.push(msg);
    if (!batch.firstMsg) batch.firstMsg = msg;
    if (caption) batch.caption = caption; // WhatsApp puts caption on the first media

    // Reset timer on each new media message
    if (batch.timer) clearTimeout(batch.timer);
    batch.timer = setTimeout(async () => {
      mediaBatch.delete(chatId);
      const batchMsgs = batch.msgs;
      const batchCaption = batch.caption;

      // Download all media
      if (batchMsgs.length > 1) {
        await botReply(batch.firstMsg, `📥 Downloading ${batchMsgs.length} files...`);
      } else {
        await botReply(batch.firstMsg, '📥 Downloading media...');
      }

      const paths = [];
      for (const m of batchMsgs) {
        const p = await provider.downloadMedia(m);
        if (p) paths.push({ path: p, type: m.type, fileName: m.fileName || null });
      }

      if (paths.length === 0) {
        await botReply(batch.firstMsg, '❌ Failed to download media.');
        return;
      }

      // Copy media into the user's workspace so Claude can access it inside the sandbox
      const useSandbox = config.sandboxEnabled && sandbox.isBwrapAvailable();
      const mediaPaths = []; // host paths for cleanup (only temp files, NOT workspace copies)

      for (const p of paths) {
        const filename = path.basename(p.path);
        if (useSandbox) {
          const sbKey = getSandboxKey(chatId, batch.senderId);
          const workspaceDir = path.join(sandbox.getSandboxDir(sbKey), 'workspace');
          fs.mkdirSync(workspaceDir, { recursive: true });
          const destPath = path.join(workspaceDir, filename);
          fs.copyFileSync(p.path, destPath);
          // Use container-visible path for the prompt
          p.promptPath = `/workspace/${filename}`;
          mediaPaths.push(p.path); // only clean up the media_tmp original; keep workspace copy
        } else {
          p.promptPath = p.path;
          mediaPaths.push(p.path);
        }
      }

      // Build prompt based on number and types of media
      let prompt;

      if (paths.length === 1) {
        const { promptPath: mp, type, fileName } = paths[0];
        if (type === 'image') {
          prompt = `Look at this image file: ${mp}\n\n${batchCaption || 'Analyze this image and describe what you see.'}`;
        } else if (type === 'document') {
          const docName = fileName ? ` (${fileName})` : '';
          prompt = `Look at this file${docName}: ${mp}\n\n${batchCaption || 'Analyze this document.'}`;
        } else if (type === 'audio') {
          prompt = `Listen to this audio file: ${mp}\n\n${batchCaption || 'Transcribe and analyze this audio.'}`;
        } else if (type === 'video') {
          prompt = `Look at this video file: ${mp}\n\n${batchCaption || 'Analyze this video.'}`;
        } else {
          prompt = `Look at this file: ${mp}\n\n${batchCaption || 'Analyze this file.'}`;
        }
      } else {
        // Multiple media — list all files
        const fileList = paths.map(p => {
          const label = p.type === 'image' ? 'Image' : p.type === 'video' ? 'Video' : p.type === 'audio' ? 'Audio' : 'File';
          const name = p.fileName ? ` (${p.fileName})` : '';
          return `- ${label}${name}: ${p.promptPath}`;
        }).join('\n');
        prompt = `Look at these files:\n${fileList}\n\n${batchCaption || 'Analyze these files.'}`;
      }

      logger.info(`Media batch prompt (${paths.length} files): ${prompt.slice(0, 200)}...`);
      await handlePrompt(batch.firstMsg, chatId, prompt, mediaPaths, batch.senderName, batch.senderId);
    }, MEDIA_BATCH_WINDOW_MS);

    mediaBatch.set(chatId, batch);
    return; // don't fall through — batch timer will handle processing
  }

  // Text-only messages: process immediately
  await handlePrompt(msg, chatId, caption, null, senderName, senderId);
});

// --- Internal HTTP API for external services (e.g. Shorty trading bot) ---
const http = require('http');
const INTERNAL_API_PORT = config.httpPort;

const apiServer = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/send') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { chatId, message } = JSON.parse(body);
        if (!chatId || !message) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'chatId and message required' }));
        }
        await botSendMessage(chatId, message);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'sent' }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  } else if (req.method === 'POST' && req.url === '/gmail/send') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { chatId, to, subject, body: emailBody } = JSON.parse(body);
        if (!chatId || !to || !subject || !emailBody) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'chatId, to, subject, and body required' }));
        }
        const result = await googleAuth.sendEmail(chatId, to, subject, emailBody);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'sent', ...result }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  } else if (req.method === 'POST' && req.url === '/gmail/inbox') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { chatId, query, maxResults } = JSON.parse(body);
        if (!chatId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'chatId required' }));
        }
        const emails = await googleAuth.listEmails(chatId, query || null, maxResults || 10);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ emails }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  } else if (req.method === 'POST' && req.url === '/gmail/read') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { chatId, messageId } = JSON.parse(body);
        if (!chatId || !messageId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'chatId and messageId required' }));
        }
        const email = await googleAuth.getEmail(chatId, messageId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ email }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  // ── Drive API endpoints ────────────────────────────────────────────────────
  } else if (req.method === 'POST' && req.url === '/drive/list') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { chatId, query, maxResults } = JSON.parse(body);
        if (!chatId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'chatId required' }));
        }
        const files = await googleAuth.listDriveFiles(chatId, query || null, maxResults || 20);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ files }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  } else if (req.method === 'POST' && req.url === '/drive/upload') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { chatId, filePath, folderId } = JSON.parse(body);
        if (!chatId || !filePath) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'chatId and filePath required' }));
        }
        const result = await googleAuth.uploadToDrive(chatId, filePath, folderId || null);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'uploaded', ...result }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  } else if (req.method === 'POST' && req.url === '/drive/get') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { chatId, fileId } = JSON.parse(body);
        if (!chatId || !fileId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'chatId and fileId required' }));
        }
        const file = await googleAuth.getDriveFile(chatId, fileId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ file }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  // ── Sheets API endpoints ───────────────────────────────────────────────────
  } else if (req.method === 'POST' && req.url === '/sheets/read') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { chatId, spreadsheetId, range } = JSON.parse(body);
        if (!chatId || !spreadsheetId || !range) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'chatId, spreadsheetId, and range required' }));
        }
        const data = await googleAuth.readSheet(chatId, spreadsheetId, range);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  } else if (req.method === 'POST' && req.url === '/sheets/write') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { chatId, spreadsheetId, range, values } = JSON.parse(body);
        if (!chatId || !spreadsheetId || !range || !values) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'chatId, spreadsheetId, range, and values required' }));
        }
        const result = await googleAuth.writeSheet(chatId, spreadsheetId, range, values);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'written', ...result }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  } else if (req.method === 'POST' && req.url === '/sheets/create') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { chatId, title } = JSON.parse(body);
        if (!chatId || !title) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'chatId and title required' }));
        }
        const sheet = await googleAuth.createSheet(chatId, title);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'created', ...sheet }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  // ── Docs API endpoints ─────────────────────────────────────────────────────
  } else if (req.method === 'POST' && req.url === '/docs/read') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { chatId, documentId } = JSON.parse(body);
        if (!chatId || !documentId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'chatId and documentId required' }));
        }
        const doc = await googleAuth.readDoc(chatId, documentId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(doc));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  } else if (req.method === 'POST' && req.url === '/docs/create') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { chatId, title, body: docBody } = JSON.parse(body);
        if (!chatId || !title) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'chatId and title required' }));
        }
        const doc = await googleAuth.createDoc(chatId, title, docBody || '');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'created', ...doc }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  // ── Outlook API endpoints ──────────────────────────────────────────────────
  } else if (req.method === 'POST' && req.url === '/outlook/send') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { chatId, to, subject, body: emailBody, cc, bcc, html } = JSON.parse(body);
        if (!chatId || !to || !subject || !emailBody) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'chatId, to, subject, and body required' }));
        }
        const result = await microsoftAuth.sendEmail(chatId, to, subject, emailBody, { cc, bcc, html });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'sent', ...result }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  } else if (req.method === 'POST' && req.url === '/outlook/inbox') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { chatId, query, maxResults, folderId } = JSON.parse(body);
        if (!chatId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'chatId required' }));
        }
        const emails = await microsoftAuth.listEmails(chatId, query || null, maxResults || 10, folderId || null);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ emails }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  } else if (req.method === 'POST' && req.url === '/outlook/read') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { chatId, messageId } = JSON.parse(body);
        if (!chatId || !messageId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'chatId and messageId required' }));
        }
        const email = await microsoftAuth.getEmail(chatId, messageId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ email }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  } else if (req.method === 'POST' && req.url === '/outlook/reply') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { chatId, messageId, comment } = JSON.parse(body);
        if (!chatId || !messageId || !comment) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'chatId, messageId, and comment required' }));
        }
        const result = await microsoftAuth.replyToEmail(chatId, messageId, comment);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  } else if (req.method === 'POST' && req.url === '/outlook/forward') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { chatId, messageId, to, comment } = JSON.parse(body);
        if (!chatId || !messageId || !to) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'chatId, messageId, and to required' }));
        }
        const result = await microsoftAuth.forwardEmail(chatId, messageId, to, comment || '');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  } else if (req.method === 'POST' && req.url === '/outlook/delete') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { chatId, messageId } = JSON.parse(body);
        if (!chatId || !messageId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'chatId and messageId required' }));
        }
        const result = await microsoftAuth.deleteEmail(chatId, messageId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  } else if (req.method === 'POST' && req.url === '/outlook/move') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { chatId, messageId, destinationFolderId } = JSON.parse(body);
        if (!chatId || !messageId || !destinationFolderId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'chatId, messageId, and destinationFolderId required' }));
        }
        const result = await microsoftAuth.moveEmail(chatId, messageId, destinationFolderId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  } else if (req.method === 'POST' && req.url === '/outlook/mark') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { chatId, messageId, isRead } = JSON.parse(body);
        if (!chatId || !messageId || isRead === undefined) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'chatId, messageId, and isRead required' }));
        }
        const result = await microsoftAuth.markEmail(chatId, messageId, isRead);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  } else if (req.method === 'POST' && req.url === '/outlook/folders') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { chatId } = JSON.parse(body);
        if (!chatId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'chatId required' }));
        }
        const folders = await microsoftAuth.listFolders(chatId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ folders }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  } else if (req.method === 'POST' && req.url === '/outlook/draft') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { chatId, to, subject, body: draftBody, html } = JSON.parse(body);
        if (!chatId || !to || !subject || !draftBody) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'chatId, to, subject, and body required' }));
        }
        const result = await microsoftAuth.createDraft(chatId, to, subject, draftBody, { html });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'draft_created', ...result }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  } else if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

apiServer.listen(INTERNAL_API_PORT, '0.0.0.0', () => {
  logger.info(`Internal API listening on 0.0.0.0:${INTERNAL_API_PORT}`);
  // Write PID file only after both ports bind successfully
  try {
    fs.writeFileSync(PID_FILE, String(process.pid));
  } catch (err) {
    logger.warn(`Could not write PID file: ${err.message}`);
  }
});
apiServer.on('error', (err) => {
  logger.error(`Internal API port ${INTERNAL_API_PORT} failed: ${err.message}`);
  process.exit(1);
});

// Prevent protocol errors from crashing Node — but exit on fatal port/startup errors
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception:', err.message);
  if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
    logger.error('Fatal port error — exiting to avoid zombie process');
    process.exit(1);
  }
});
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', reason?.message || reason);
  if (reason?.code === 'EADDRINUSE' || reason?.code === 'EACCES') {
    logger.error('Fatal port error — exiting to avoid zombie process');
    process.exit(1);
  }
});

// Graceful shutdown
async function shutdown() {
  logger.info('Shutting down...');
  try { fs.unlinkSync(PID_FILE); } catch { /* ignore */ }
  sandbox.shutdown();
  apiServer.close();
  await provider.destroy();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

logger.info('Initializing Cloud API provider...');
provider.initialize().catch((err) => {
  logger.error(`Webhook server failed to start: ${err.message}`);
  process.exit(1);
});
