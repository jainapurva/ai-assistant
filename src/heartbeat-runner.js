/**
 * Heartbeat Runner — periodically checks inactive users and sends smart
 * follow-up messages when Claude decides one would be genuinely useful.
 *
 * Structural mirror of nurture-runner.js: init(send), runHeartbeatCycle(),
 * registered as a node-cron job from index.js.
 *
 * Rules:
 *   - User must have been silent for >= HEARTBEAT_THRESHOLD_HOURS (default 10h).
 *   - Not more than one heartbeat per HEARTBEAT_COOLDOWN_HOURS (default 24h).
 *   - Quiet hours [HEARTBEAT_QUIET_START, HEARTBEAT_QUIET_END) in the user's
 *     local timezone (default America/Los_Angeles) suppress sends.
 *   - Claude is the decider: given history + project + goal, it either replies
 *     with "SKIP" (stay silent) or a short WhatsApp-friendly follow-up.
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const config = require('./config');
const claude = require('./claude');
const conversation = require('./conversation-logger');
const profiles = require('./profiles');
const agents = require('./agents');
const chatLogger = require('./chat-logger');

let sendMessageFn = null;
let sdkRef = null; // cached lazily

function init(sendFn) {
  sendMessageFn = sendFn;
}

// --- Helpers ----------------------------------------------------------------

async function getSDK() {
  if (!sdkRef) {
    sdkRef = await import('@anthropic-ai/claude-agent-sdk');
  }
  return sdkRef;
}

/**
 * Get the hour (0-23) for "now" in the given IANA timezone.
 */
function currentHourInTz(now, tz) {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: tz,
    });
    const parts = fmt.formatToParts(now);
    const hourPart = parts.find(p => p.type === 'hour');
    const hour = parseInt(hourPart?.value ?? '0', 10);
    // Intl returns "24" at midnight in some locales — normalise
    return hour === 24 ? 0 : hour;
  } catch (e) {
    logger.warn(`[heartbeat] bad timezone "${tz}", falling back to UTC: ${e.message}`);
    return now.getUTCHours();
  }
}

/**
 * Returns true if `hour` falls inside the quiet window [start, end).
 * Handles wrap-around (e.g. 23..8 covers 23, 0..7).
 */
function isQuietHour(hour, start, end) {
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  // wraps midnight
  return hour >= start || hour < end;
}

function resolveTimezone(chatId) {
  const profile = profiles.getProfile(chatId);
  return profile?.timezone || config.heartbeatDefaultTz;
}

/**
 * Best-effort seed of lastUserMessageAt for users we've never recorded.
 * Reads the last [USER] line timestamp from logs/<phone>.log.
 */
function seedLastUserMessageFromLog(chatId) {
  try {
    const logPath = path.join(chatLogger.LOGS_DIR, `${chatId.replace('@c.us', '')}.log`);
    if (!fs.existsSync(logPath)) return null;
    const data = fs.readFileSync(logPath, 'utf8');
    const lines = data.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (!line.includes('[USER]')) continue;
      const m = line.match(/^\[([^\]]+)\]/);
      if (!m) continue;
      const ts = Date.parse(m[1]);
      if (!isNaN(ts)) return ts;
    }
  } catch (e) {
    logger.warn(`[heartbeat] seed read failed for ${chatId}: ${e.message}`);
  }
  return null;
}

/**
 * Build the prompt for Claude's decision call.
 */
function buildDecisionPrompt({ displayName, hoursSinceLastMessage, history, agentId, projectDir }) {
  const historyBlock = history.length
    ? history
        .map(e => `[${e.role === 'user' ? 'User' : 'Assistant'}]: ${e.content.slice(0, 1000)}`)
        .join('\n\n')
    : '(no prior conversation)';

  const hoursTxt = Number(hoursSinceLastMessage).toFixed(1);

  return `You are the heartbeat decider for a WhatsApp AI assistant. Your job is to decide whether to send ${displayName || 'this user'} a single short check-in message, and if so, what to say.

Context:
- User display name: ${displayName || 'Unknown'}
- Hours since their last message: ${hoursTxt}
- Active agent: ${agentId || 'general'}
- Active project directory: ${projectDir || '(none)'}

Recent conversation (most recent last):
${historyBlock}

DECIDE one of two things and output ONLY that:

1. Output exactly "SKIP" (no quotes, no extra words) if any of the following hold:
   - The conversation reached a natural conclusion (user said thanks / ok / got it and we closed the loop).
   - We are not waiting on them and there's no open thread worth re-opening.
   - Pinging would feel like nagging or spam.
   - There is no prior conversation.

2. Otherwise output a single short WhatsApp message (1–3 sentences, ~200 chars max) that:
   - References the actual goal or task they were working on.
   - Asks a specific, useful follow-up — e.g. "Do you want me to go ahead and draft the invoice?", "Still want me to run that deployment?", "Any update on the listing photos so I can continue?".
   - Is warm and human, not salesy. No emoji unless it naturally fits. No "Hi {name}!" openers.
   - Does NOT start with "Heartbeat" or any bracketed label — the wrapper adds that.

Output ONLY the message text or the literal word SKIP. No preamble, no explanation, no code fences.`;
}

/**
 * Invoke Claude (one-shot, no MCP, no session) to get a decision.
 * Returns "SKIP" or the message text.
 */
async function askClaude(prompt) {
  const { query } = await getSDK();
  const model = config.claudeModel;

  const handle = query({
    prompt,
    options: {
      model,
      permissionMode: 'bypassPermissions',
      maxTurns: 1,
      systemPrompt: 'You are a laconic decision assistant. Output exactly what the user prompt instructs, with no preamble.',
    },
  });

  let text = '';
  for await (const message of handle) {
    if (message.type === 'assistant' && message.content) {
      for (const block of message.content) {
        if (block.type === 'text') text += block.text;
      }
    }
  }
  return text.trim();
}

/**
 * Decide + send for a single chatId. Returns one of:
 *   'sent' | 'skipped-threshold' | 'skipped-cooldown' | 'skipped-quiet'
 *   | 'skipped-disabled' | 'skipped-no-history' | 'skipped-claude' | 'error'
 */
async function processUser(chatId, now = Date.now()) {
  if (!config.heartbeatEnabled) return 'skipped-disabled';

  // Allowlist gate (for staged rollout / testing)
  if (config.heartbeatAllowedChats.length > 0 && !config.heartbeatAllowedChats.includes(chatId)) {
    return 'skipped-disabled';
  }

  const state = claude.getHeartbeatState(chatId) || {};
  if (state.enabled === false) return 'skipped-disabled';

  let lastUserAt = state.lastUserMessageAt;
  if (!lastUserAt) {
    lastUserAt = seedLastUserMessageFromLog(chatId);
    if (lastUserAt) {
      claude.recordUserMessage(chatId, lastUserAt);
    } else {
      return 'skipped-no-history';
    }
  }

  const thresholdMs = config.heartbeatThresholdHours * 3600 * 1000;
  const cooldownMs = config.heartbeatCooldownHours * 3600 * 1000;

  const idleMs = now - lastUserAt;
  if (idleMs < thresholdMs) return 'skipped-threshold';

  if (state.lastHeartbeatAt && now - state.lastHeartbeatAt < cooldownMs) {
    return 'skipped-cooldown';
  }

  const tz = resolveTimezone(chatId);
  const hour = currentHourInTz(new Date(now), tz);
  if (isQuietHour(hour, config.heartbeatQuietStartHour, config.heartbeatQuietEndHour)) {
    return 'skipped-quiet';
  }

  // Load history for context
  const sandboxKey = claude.getSandboxKey ? claude.getSandboxKey(chatId) : chatId;
  const agentId = claude.getUserAgent(chatId) || (agents.getDefaultAgentId && agents.getDefaultAgentId()) || 'general';
  const history = conversation.loadHistory(sandboxKey, agentId, 20);
  if (!history || history.length === 0) return 'skipped-no-history';

  const profile = profiles.getProfile(chatId);
  const projectDir = claude.getProjectDir ? claude.getProjectDir(chatId) : null;

  const prompt = buildDecisionPrompt({
    displayName: profile?.displayName,
    hoursSinceLastMessage: idleMs / 3600000,
    history,
    agentId,
    projectDir,
  });

  let decision;
  try {
    decision = await askClaude(prompt);
  } catch (e) {
    logger.error(`[heartbeat] Claude call failed for ${chatId}: ${e.message}`);
    return 'error';
  }

  if (!decision || /^SKIP\b/i.test(decision)) return 'skipped-claude';

  // Clean up: strip code fences / stray quotes, cap length
  let message = decision
    .replace(/^```[a-z]*\n?/i, '')
    .replace(/```$/i, '')
    .replace(/^["']|["']$/g, '')
    .trim();

  if (!message) return 'skipped-claude';
  if (message.length > 600) message = message.slice(0, 600).trim();

  const formatted = `*[Heartbeat]*\n\n${message}`;
  try {
    await sendMessageFn(chatId, formatted);
    claude.recordHeartbeatSent(chatId, now);
    logger.info(`[heartbeat] sent to ${chatId} (idle ${(idleMs / 3600000).toFixed(1)}h)`);
    return 'sent';
  } catch (e) {
    logger.error(`[heartbeat] send failed for ${chatId}: ${e.message}`);
    return 'error';
  }
}

/**
 * Run one heartbeat cycle across all known users.
 */
async function runHeartbeatCycle() {
  if (!sendMessageFn) {
    logger.warn('[heartbeat] No send function configured, skipping cycle');
    return { sent: 0, considered: 0 };
  }
  if (!config.heartbeatEnabled) return { sent: 0, considered: 0 };

  const chatIds = new Set([
    ...(claude.getAllChatIds ? claude.getAllChatIds() : []),
    ...(claude.getAllHeartbeatChatIds ? claude.getAllHeartbeatChatIds() : []),
  ]);

  const now = Date.now();
  let sent = 0;
  let considered = 0;
  const outcomes = {};

  for (const chatId of chatIds) {
    considered++;
    let outcome = 'error';
    try {
      outcome = await processUser(chatId, now);
    } catch (e) {
      logger.error(`[heartbeat] processUser crashed for ${chatId}: ${e.message}`);
    }
    outcomes[outcome] = (outcomes[outcome] || 0) + 1;
    if (outcome === 'sent') sent++;
  }

  if (considered > 0) {
    logger.info(`[heartbeat] cycle complete: considered=${considered} sent=${sent} outcomes=${JSON.stringify(outcomes)}`);
  }
  return { sent, considered, outcomes };
}

module.exports = {
  init,
  runHeartbeatCycle,
  processUser,
  // Exposed for tests
  _internal: {
    currentHourInTz,
    isQuietHour,
    resolveTimezone,
    seedLastUserMessageFromLog,
    buildDecisionPrompt,
    _setSDKForTesting: (mock) => { sdkRef = mock; },
    _setClaudeForTesting: (mock) => { /* reserved */ },
  },
};
