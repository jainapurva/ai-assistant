require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH || '.env' });

const path = require('path');

module.exports = {
  whitelistedNumber: process.env.WHITELISTED_NUMBER,
  targetChat: process.env.TARGET_CHAT,
  claudePath: process.env.CLAUDE_PATH || '/home/ddarji/.local/bin/claude',
  claudeModel: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
  maxChunkSize: parseInt(process.env.MAX_RESPONSE_CHARS || '4000', 10),
  commandTimeoutMs: parseInt(process.env.COMMAND_TIMEOUT_MS || '120000', 10),
  enableSessions: process.env.ENABLE_SESSIONS !== 'false',
  botName: process.env.BOT_NAME || 'Claude Bot',
  httpPort: parseInt(process.env.HTTP_PORT || '5151', 10),
  // Comma-separated WhatsApp IDs of admins (e.g. "16262300167@c.us,14243937267@c.us")
  // Groups are only activated if at least one of these is a group admin
  adminNumbers: (process.env.ADMIN_NUMBERS || '').split(',').map(s => s.trim()).filter(Boolean),
  // Absolute paths for persistent state — must not change between prod/dev clones
  stateDir: process.env.BOT_STATE_DIR || path.join(__dirname, '..'),
  // Meta Cloud API settings
  metaAccessToken: process.env.META_ACCESS_TOKEN || '',
  metaAppSecret: process.env.META_APP_SECRET || '',
  metaPhoneNumberId: process.env.META_PHONE_NUMBER_ID || '',
  metaWebhookVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN || '',
  webhookPort: parseInt(process.env.WEBHOOK_PORT || '3000', 10),
  // Open access mode: when true, all DMs are allowed (standalone bot)
  openAccess: process.env.OPEN_ACCESS !== 'false',
};
