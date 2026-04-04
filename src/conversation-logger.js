const fs = require('fs');
const path = require('path');
const sandbox = require('./sandbox');
const logger = require('./logger');

// Max chars to store per assistant response (prevents bloat)
const MAX_ASSISTANT_CONTENT = 8000;
// Default number of messages to load for context injection
const DEFAULT_MAX_MESSAGES = 20;

/**
 * Get the path to a conversation log file for a given sandbox key and agent.
 */
function getConversationLogPath(sandboxKey, agentId) {
  const base = sandbox.getSandboxDir(sandboxKey);
  return path.join(base, 'agents', agentId, 'conversation.jsonl');
}

/**
 * Append a conversation entry to the JSONL log.
 * @param {string} sandboxKey - Sandbox identifier (hashed chatId or senderId)
 * @param {string} agentId - Agent identifier (e.g. 'general')
 * @param {'user'|'assistant'} role
 * @param {string} content
 */
function logEntry(sandboxKey, agentId, role, content) {
  try {
    const logPath = getConversationLogPath(sandboxKey, agentId);
    const dir = path.dirname(logPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let stored = content;
    if (role === 'assistant' && stored.length > MAX_ASSISTANT_CONTENT) {
      stored = stored.slice(0, MAX_ASSISTANT_CONTENT) + '\n[truncated]';
    }

    const entry = {
      ts: new Date().toISOString(),
      role,
      content: stored,
    };
    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
  } catch (e) {
    logger.warn(`conversation-logger: failed to write entry: ${e.message}`);
  }
}

/**
 * Load the last N conversation entries from the JSONL log.
 * @param {string} sandboxKey
 * @param {string} agentId
 * @param {number} [maxMessages=20]
 * @returns {Array<{ts: string, role: string, content: string}>}
 */
function loadHistory(sandboxKey, agentId, maxMessages = DEFAULT_MAX_MESSAGES) {
  const logPath = getConversationLogPath(sandboxKey, agentId);
  if (!fs.existsSync(logPath)) return [];

  try {
    const data = fs.readFileSync(logPath, 'utf8');
    const lines = data.trim().split('\n').filter(Boolean);

    // Take the last N lines
    const recent = lines.slice(-maxMessages);
    const entries = [];
    for (const line of recent) {
      try {
        entries.push(JSON.parse(line));
      } catch {
        // Skip corrupt lines
      }
    }
    return entries;
  } catch (e) {
    logger.warn(`conversation-logger: failed to load history: ${e.message}`);
    return [];
  }
}

/**
 * Format conversation history entries into a context block for prompt injection.
 * @param {Array<{role: string, content: string}>} entries
 * @returns {string}
 */
function formatHistoryAsContext(entries) {
  if (!entries || entries.length === 0) return '';

  const lines = entries.map(e => {
    const label = e.role === 'user' ? 'User' : 'Assistant';
    return `[${label}]: ${e.content}`;
  });

  return `<conversation_history>
The following is the conversation history from previous messages. Use this to maintain context and continuity:

${lines.join('\n\n')}
</conversation_history>

`;
}

/**
 * Clear conversation history for a user/agent.
 * @param {string} sandboxKey
 * @param {string} agentId
 */
function clearHistory(sandboxKey, agentId) {
  const logPath = getConversationLogPath(sandboxKey, agentId);
  try {
    if (fs.existsSync(logPath)) {
      fs.unlinkSync(logPath);
    }
  } catch (e) {
    logger.warn(`conversation-logger: failed to clear history: ${e.message}`);
  }
}

module.exports = {
  logEntry,
  loadHistory,
  formatHistoryAsContext,
  clearHistory,
  getConversationLogPath,
};
