// Test environment setup — runs before each test file
// Prevent loading real .env files, set safe test defaults
process.env.DOTENV_CONFIG_PATH = '/dev/null';
process.env.INSTANCE_ID = 'test';
process.env.ENABLE_SESSIONS = 'true';
process.env.CLAUDE_MODEL = 'claude-opus-4-6';
process.env.BOT_NAME = 'TestBot';
process.env.WHITELISTED_NUMBER = '91XXXXXXXXXX@c.us';
process.env.HTTP_PORT = '15151';
