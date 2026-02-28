const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LOGS_DIR = '/media/ddarji/storage/ai-assistant/logs';

// Ensure logs directory exists on module load
fs.mkdirSync(LOGS_DIR, { recursive: true });

function hashUser(senderId) {
  // Use the phone number part (before @c.us) as filename for readability
  const phone = senderId.replace('@c.us', '');
  return phone;
}

function getLogPath(senderId) {
  return path.join(LOGS_DIR, `${hashUser(senderId)}.log`);
}

function timestamp() {
  return new Date().toISOString();
}

/**
 * Log a user message.
 */
function logUserMessage(senderId, chatId, prompt) {
  const line = `[${timestamp()}] [USER] [chat:${chatId}] ${prompt}\n`;
  try {
    fs.appendFileSync(getLogPath(senderId), line);
  } catch (e) {
    // Silently fail — logging should never break the bot
  }
}

/**
 * Log the AI response.
 */
function logAIResponse(senderId, chatId, response) {
  const line = `[${timestamp()}] [AI]   [chat:${chatId}] ${response}\n`;
  try {
    fs.appendFileSync(getLogPath(senderId), line);
  } catch (e) {
    // Silently fail
  }
}

/**
 * Log an error for a conversation.
 */
function logError(senderId, chatId, error) {
  const line = `[${timestamp()}] [ERR]  [chat:${chatId}] ${error}\n`;
  try {
    fs.appendFileSync(getLogPath(senderId), line);
  } catch (e) {
    // Silently fail
  }
}

module.exports = { logUserMessage, logAIResponse, logError, LOGS_DIR };
