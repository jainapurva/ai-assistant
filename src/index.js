require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH || '.env' });
const path = require('path');
const fs = require('fs');
const config = require('./config');
const { createProvider } = require('./providers');
const { runClaude, stopClaude, isRunning, getRunningInfo, getTaskHistory, clearSession, setProjectDir, getProjectDir, clearProjectDir, setChatModel, getChatModel, clearChatModel, getTokenUsage, resetTokenUsage } = require('./claude');
const { ensureProfile, getProfile, registerUser, getAllProfiles, formatProfileCard } = require('./profiles');
const apiCommands = require('./api-commands');
const drive = require('./drive');
const { stripAnsi, chunkMessage } = require('./formatter');
const { detectOptions } = require('./options');
const { discoverProjects, getProjectSummary } = require('./projects');
const scheduler = require('./scheduler');
const logger = require('./logger');

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
  await provider.replyToMessage(msg, text);
}

async function botSendChunks(msg, text) {
  const chunks = chunkMessage(text, config.maxChunkSize);
  for (const chunk of chunks) {
    await provider.replyToMessage(msg, chunk);
  }
}

async function botSendPoll(chatId, question, options) {
  await provider.sendPoll(chatId, question, options);
}

async function botSendMessage(chatId, text) {
  await provider.sendMessage(chatId, text);
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
async function handlePrompt(msg, chatId, prompt, mediaPath, senderName) {
  const isGroup = chatId.endsWith('@g.us');

  if (processing.has(chatId)) {
    // Queue the message instead of rejecting
    if (!messageQueue.has(chatId)) messageQueue.set(chatId, []);
    const queue = messageQueue.get(chatId);
    queue.push({ msg, chatId, prompt, mediaPath, senderName });
    await botReply(msg, `📋 Queued (#${queue.length} in line). I'll get to it after the current task.`);
    return;
  }
  processing.add(chatId);

  await botReply(msg, '⚡ Working on it...');

  // For group chats, prefix with sender name so Claude knows who's talking
  if (isGroup) {
    const name = senderName || config.botName;
    prompt = `[${name}]: ${prompt}`;
  }

  await provider.sendTyping(chatId);

  try {
    const rawResponse = await runClaude(prompt, chatId);
    const cleaned = stripAnsi(rawResponse).trim();

    if (!cleaned) {
      await botReply(msg, '✅ Done (no text output)');
      return;
    }

    await sendClaudeResponse(msg, chatId, cleaned);
    logger.info(`Response sent (${cleaned.length} chars)`);
  } catch (err) {
    if (err.message === 'STOPPED_BY_USER') {
      logger.info(`Task stopped by user for chat ${chatId}`);
    } else {
      logger.error('Error processing message:', err.message);
      try { await botReply(msg, `❌ Error: ${err.message}`); } catch (e) {
        logger.error('Failed to send error reply:', e.message);
      }
    }
  } finally {
    processing.delete(chatId);
    await provider.clearTyping(chatId);
    // Clean up media for this task
    if (mediaPath) {
      try { fs.unlinkSync(mediaPath); } catch (e) {}
    }
    // Process next queued message if any
    processQueue(chatId);
  }
}

// Process the next item in the queue for a chat
function processQueue(chatId) {
  const queue = messageQueue.get(chatId);
  if (!queue || queue.length === 0) return;
  const next = queue.shift();
  if (queue.length === 0) messageQueue.delete(chatId);
  logger.info(`Dequeuing next message for ${chatId} (${queue ? queue.length : 0} remaining)`);
  // Fire and forget — handlePrompt manages its own lifecycle
  handlePrompt(next.msg, next.chatId, next.prompt, next.mediaPath, next.senderName);
}

function getQueueLength(chatId) {
  const queue = messageQueue.get(chatId);
  return queue ? queue.length : 0;
}

const HELP_TEXT = `*Claude Code Bot* 🤖

Just send any message and Claude will execute it autonomously on your PC.

*Supported inputs:*
📝 Text — any instruction or question
🖼️ Images — send a photo with optional caption
📄 Documents — PDFs and other files
🗳️ Polls — when Claude gives options, tap to choose!

*Multiple sessions:*
Create WhatsApp groups with "Claude" in the name!
• "Claude - Website" → one session
• "Claude - Videos" → another session
Each group has its own conversation + project.

*Project directories:*
/project ~/news-swarm-project → set working dir
/projects → see current project
Claude loads CLAUDE.md, skills & commands from the project dir.

*Commands:*
/register <name> [email] - Create your user profile
/profile - View your profile & usage stats
/usage - Token usage for this chat
/files - List & download files from your workspace
/imagine <prompt> - Generate an image (DALL-E 3)
/drive - List files uploaded to Google Drive
/stop - ⛔ Stop current task
/stop all - ⛔ Stop + clear queue
/reset - Clear session, project & queue
/status - Bot status
/help - Show this message

*Admin commands:*
/claude-projects - Browse & open any project
/project <path> - Set project directory
/model <name> - Set model (opus/sonnet/haiku)
/schedule every 30m <prompt> - Schedule task
/schedules - List scheduled tasks
/unschedule <id|all> - Remove scheduled task(s)
/enable <command> - Enable an API command for this chat
/disable <command> - Disable an API command for this chat
/profile <number> - View any user's profile

*Quick replies:*
Numbered options → tap the poll or reply with 1, 2, 3...

Claude has *full permissions* — it does everything independently.`;

// Returns true if the given WA ID is a configured admin
function isAdmin(waId) {
  if (!waId) return false;
  if (config.adminNumbers.length === 0) return false;
  return config.adminNumbers.includes(waId);
}

function isAllowedChat(chatId) {
  // Open access mode: all DMs allowed
  if (config.openAccess && !chatId.endsWith('@g.us')) return true;

  // Allow specific target chat (DM with bot owner)
  if (config.targetChat && chatId === config.targetChat) return true;

  // Reject everything else (groups not yet supported in Cloud API)
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

// --- Provider event handlers ---

provider.on('ready', () => {
  // Initialize scheduler with provider-based send function
  scheduler.init(provider, async (chatId, text) => {
    const sentId = await provider.sendMessage(chatId, text);
    if (sentId) {
      botSentMessageIds.add(sentId);
      setTimeout(() => botSentMessageIds.delete(sentId), 30000);
    }
  });
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
  const isImage = msg.type === 'image';
  const isDocument = msg.type === 'document';
  const hasMedia = msg.hasMedia;

  if (!isText && !isImage && !isDocument) return;

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

  // Handle commands (text only)
  if (isText) {
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
      messageQueue.delete(chatId);
      await botReply(msg, '🔄 Session, project, queue, and usage counter cleared. Starting fresh.');
      return;
    }
    if (caption.toLowerCase() === '/status') {
      const projDir = getProjectDir(chatId) || '(none — using home dir)';
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
        statusText += `\nModel: ${currentModel}\nProject: ${projDir}\n\nSend /stop to interrupt.`;
      } else {
        statusText += `✅ *Idle — no task running*\nModel: ${currentModel}\nProject: ${projDir}`;
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
        await botReply(msg,
          `📊 *Token usage for this chat*\n\n` +
          `🔤 Input:  ${usage.input.toLocaleString()}\n` +
          `🔤 Output: ${usage.output.toLocaleString()}\n` +
          `📦 Total:  ${total.toLocaleString()}\n` +
          `✅ Tasks:  ${usage.tasks}\n\n` +
          `_Counters reset on /reset_`
        );
      }
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

    // /files — list files in the workspace (TASK-005)
    if (caption.toLowerCase() === '/files') {
      const workspaceDir = getProjectDir(chatId) || process.env.HOME;

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

    // /drive — list files uploaded to this group's Google Drive folder (TASK-012)
    if (caption.toLowerCase() === '/drive') {
      if (!drive.isConfigured()) {
        await botReply(msg, '❌ Google Drive is not configured. Set GOOGLE_CREDENTIALS_FILE in .env.');
        return;
      }
      await botReply(msg, '🔍 Fetching Drive files...');
      try {
        const files = await drive.listFiles(chatId);
        if (files.length === 0) {
          await botReply(msg, '📁 No files uploaded to Drive for this group yet.');
        } else {
          const lines = files.map(f =>
            `📄 *${f.name}*\n   ${f.size} · ${new Date(f.modifiedTime).toLocaleDateString()}\n   ${f.link}`
          ).join('\n\n');
          await botSendChunks(msg, `📁 *Drive files for this group:*\n\n${lines}`);
        }
      } catch (e) {
        await botReply(msg, `❌ Drive error: ${e.message}`);
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

    // /project <path> — set working directory for this chat (admin-only in groups)
    const projectMatch = caption.match(/^\/project\s+(.+)/i);
    if (projectMatch) {
      if (isGroup && !senderIsAdmin) {
        await botReply(msg, '🔒 Only admins can change the group project.');
        return;
      }
      const home = process.env.HOME || '/home/ddarji';
      const dir = projectMatch[1].trim().replace(/^~\//, home + '/').replace(/^~$/, home);
      try {
        setProjectDir(chatId, dir);
        clearSession(chatId);
        await botReply(msg, `📂 Project set: *${dir}*\nClaude will now run from this directory and pick up its CLAUDE.md, skills, and commands.\nSession reset for fresh start.`);
      } catch (e) {
        await botReply(msg, `❌ ${e.message}`);
      }
      return;
    }

    // /claude-projects or /projects — discover and list all Claude projects as a poll (admin-only in groups)
    if (caption.toLowerCase() === '/claude-projects' || caption.toLowerCase() === '/projects') {
      if (isGroup && !senderIsAdmin) {
        await botReply(msg, '🔒 Only admins can browse projects in a group.');
        return;
      }
      const projects = discoverProjects();

      if (projects.length === 0) {
        await botReply(msg, '📂 No projects with CLAUDE.md or Claude memory found.');
        return;
      }

      const currentDir = getProjectDir(chatId);

      let summary = `📂 *Found ${projects.length} Claude project(s):*\n\n`;
      const pollOptions = [];
      const pollDirs = [];

      for (let i = 0; i < projects.length; i++) {
        const p = projects[i];
        const isCurrent = currentDir === p.dir ? ' ✅' : '';
        const badges = [];
        if (p.hasClaudeMd) badges.push('📄');
        if (p.hasMemory) badges.push('🧠');
        const desc = getProjectSummary(p.dir);

        summary += `*${i + 1}. ${p.name}*${isCurrent}\n${badges.join('')} ${p.dir}\n`;
        if (desc) summary += `   _${desc}_\n`;
        summary += '\n';

        const shortPath = p.dir.replace(process.env.HOME || '/home/ddarji', '~');
        let optLabel = shortPath;
        if (isCurrent) optLabel += ' ✅';
        if (optLabel.length > 100) optLabel = optLabel.slice(0, 97) + '...';
        pollOptions.push(optLabel);
        pollDirs.push(p.dir);
      }

      await botSendChunks(msg, summary);

      setPendingProjectPoll(chatId, { dirs: pollDirs, options: pollOptions });
      setQuickReplies(chatId, pollOptions);

      if (pollOptions.length >= 2 && pollOptions.length <= 12) {
        await botSendPoll(chatId, 'Select a project to open:', pollOptions);
      } else if (pollOptions.length > 12) {
        await botReply(msg, `_Reply with a number (1-${pollOptions.length}) to select a project._`);
      }

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
          if (drive.isConfigured()) {
            await botReply(msg, `📤 File too large for WhatsApp (${(stat.size / 1048576).toFixed(1)}MB). Uploading to Drive...`);
            try {
              const link = await drive.uploadFile(chatId, chatId, fullPath);
              await botReply(msg, `✅ *${name}* uploaded to Drive:\n${link}`);
            } catch (e) {
              await botReply(msg, `❌ Drive upload failed: ${e.message}`);
            }
          } else {
            await botReply(msg, `⚠️ File is ${(stat.size / 1048576).toFixed(1)}MB — too large for WhatsApp and Drive is not configured.`);
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
            await botReply(msg, `📂 Project set: *${path.basename(dir)}*\n${dir}\n\nSession reset. Send a message to start working!`);
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
          await handlePrompt(msg, chatId, `I choose: ${selectedOption}`);
          return;
        }
      }
    }
  }

  let prompt = caption;
  let mediaPath = null;

  // Download media if present
  if (hasMedia && (isImage || isDocument)) {
    await botReply(msg, '📥 Downloading media...');
    mediaPath = await provider.downloadMedia(msg);

    if (!mediaPath) {
      await botReply(msg, '❌ Failed to download media.');
      return;
    }

    if (isImage) {
      const userCaption = caption || 'Analyze this image and describe what you see.';
      prompt = `Look at this image file: ${mediaPath}\n\n${userCaption}`;
    } else if (isDocument) {
      const userCaption = caption || 'Analyze this document.';
      prompt = `Look at this file: ${mediaPath}\n\n${userCaption}`;
    }

    logger.info(`Media prompt: ${prompt.slice(0, 150)}...`);
  }

  // Resolve sender name and auto-create profile for group messages
  let senderName = config.botName;
  if (isGroup && !msg.fromMe) {
    const contactInfo = await provider.getContactFromMessage(msg);
    if (contactInfo) {
      senderName = contactInfo.pushname || contactInfo.shortName || contactInfo.name || 'Unknown';
    }
    ensureProfile(senderId, senderName);
  } else if (!msg.fromMe && msg.pushName) {
    // For Cloud API DMs, use pushName for profile
    senderName = msg.pushName;
    ensureProfile(senderId, senderName);
  }

  await handlePrompt(msg, chatId, prompt, mediaPath, senderName);
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
  } else if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

apiServer.listen(INTERNAL_API_PORT, '127.0.0.1', () => {
  logger.info(`Internal API listening on 127.0.0.1:${INTERNAL_API_PORT}`);
});

// Prevent protocol errors from crashing Node
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception (non-fatal):', err.message);
});
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection (non-fatal):', reason?.message || reason);
});

// Graceful shutdown
async function shutdown() {
  logger.info('Shutting down...');
  apiServer.close();
  await provider.destroy();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

logger.info('Initializing Cloud API provider...');
provider.initialize();
