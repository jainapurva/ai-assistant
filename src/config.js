require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH || '.env' });

const path = require('path');

module.exports = {
  whitelistedNumber: process.env.WHITELISTED_NUMBER,
  targetChat: process.env.TARGET_CHAT,
  claudePath: process.env.CLAUDE_PATH || '/home/ddarji/.local/bin/claude',
  claudeModel: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
  maxChunkSize: parseInt(process.env.MAX_RESPONSE_CHARS || '4000', 10),
  commandTimeoutMs: parseInt(process.env.COMMAND_TIMEOUT_MS || '600000', 10),
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
  // Sandbox settings
  sandboxEnabled: process.env.SANDBOX_ENABLED === 'true',
  sandboxBaseDir: process.env.SANDBOX_BASE_DIR || '/media/ddarji/storage/ai-assistant/sandboxes',
  sandboxMemory: process.env.SANDBOX_MEMORY || '512m',
  sandboxCpus: process.env.SANDBOX_CPUS || '1',
  sandboxPidsLimit: process.env.SANDBOX_PIDS_LIMIT || '256',
  sandboxWorkspaceMaxMB: parseInt(process.env.SANDBOX_WORKSPACE_MAX_MB || '500', 10),
  sandboxIdleTimeoutMs: parseInt(process.env.SANDBOX_IDLE_TIMEOUT_MS || '86400000', 10),
  // Google OAuth2 (for per-user Gmail integration)
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || '',
  // Microsoft / Outlook OAuth2
  microsoftClientId: process.env.MICROSOFT_CLIENT_ID || '',
  microsoftClientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
  microsoftRedirectUri: process.env.MICROSOFT_REDIRECT_URI || '',
  // Shopify OAuth (for per-user Shopify store management)
  shopifyClientId: process.env.SHOPIFY_CLIENT_ID || '',
  shopifyClientSecret: process.env.SHOPIFY_CLIENT_SECRET || '',
  shopifyRedirectUri: process.env.SHOPIFY_REDIRECT_URI || '',
  // MCP server paths (for Google integration inside sandboxes)
  nodeBinaryPath: process.env.NODE_BINARY_PATH || '/home/ddarji/.nvm/versions/node/v20.20.0/bin/node',
  mcpServerPath: process.env.MCP_SERVER_PATH || path.join(__dirname, '..', 'dist', 'google-mcp-server.bundle.js'),
  // Shopify MCP server path
  shopifyMcpPath: process.env.SHOPIFY_MCP_PATH || path.join(__dirname, '..', 'dist', 'shopify-mcp-server.bundle.js'),
  // GitHub App (for repo management via Website Manager agent)
  githubAppId: process.env.GITHUB_APP_ID || '',
  githubAppSlug: process.env.GITHUB_APP_SLUG || 'swayat-ai',
  githubClientId: process.env.GITHUB_CLIENT_ID || '',
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET || '',
  githubPrivateKeyPath: process.env.GITHUB_PRIVATE_KEY_PATH || '',
  githubWebhookSecret: process.env.GITHUB_WEBHOOK_SECRET || '',
  // Resend MCP (per-user API keys stored in resend-keys.json)
  resendMcpPath: process.env.RESEND_MCP_PATH || path.join(__dirname, '..', 'dist', 'resend-mcp-server.bundle.mjs'),
  // Playwright MCP (browser automation)
  playwrightMcpPath: process.env.PLAYWRIGHT_MCP_PATH || path.join(__dirname, '..', 'node_modules', '@playwright', 'mcp', 'cli.js'),
  playwrightBrowsersPath: process.env.PLAYWRIGHT_BROWSERS_PATH || '/media/ddarji/storage/.cache/playwright',
  // Outlook MCP server path
  outlookMcpServerPath: process.env.OUTLOOK_MCP_SERVER_PATH || path.join(__dirname, '..', 'dist', 'outlook-mcp-server.bundle.js'),
  // GitHub MCP server path
  githubMcpServerPath: process.env.GITHUB_MCP_SERVER_PATH || path.join(__dirname, '..', 'dist', 'github-mcp-server.bundle.js'),
  // Trading MCP server path (paper trading)
  tradingMcpPath: process.env.TRADING_MCP_PATH || path.join(__dirname, '..', 'dist', 'trading-mcp-server.bundle.js'),
  // Job Hunter MCP server path
  jobHunterMcpPath: process.env.JOB_HUNTER_MCP_PATH || path.join(__dirname, '..', 'dist', 'job-hunter-mcp-server.bundle.js'),
  // JSearch API key (RapidAPI) — optional, free APIs work without it
  jsearchApiKey: process.env.JSEARCH_API_KEY || '',
  // Real Estate MCP server path
  realestateMcpPath: process.env.REALESTATE_MCP_PATH || path.join(__dirname, '..', 'dist', 'realestate-mcp-server.bundle.js'),
  // Real Estate external API keys
  fubApiKey: process.env.FUB_API_KEY || '',
  mlsApiUrl: process.env.MLS_API_URL || '',
  mlsApiToken: process.env.MLS_API_TOKEN || '',
  attomApiKey: process.env.ATTOM_API_KEY || '',
  walkscoreApiKey: process.env.WALKSCORE_API_KEY || '',
  greatschoolsApiKey: process.env.GREATSCHOOLS_API_KEY || '',
  fredApiKey: process.env.FRED_API_KEY || '',
  // FreeTools social publishing MCP server path
  freetoolsMcpPath: process.env.FREETOOLS_MCP_PATH || path.join(__dirname, '..', 'dist', 'freetools-mcp-server.bundle.js'),
  // Public base URL for the webhook server (cloudflare tunnel) — used for serving media files
  webhookBaseUrl: process.env.WEBHOOK_BASE_URL || '',
};
