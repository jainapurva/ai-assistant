const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./logger');
const { filterSensitiveOutput, sanitizePaths, SECURITY_SYSTEM_PROMPT } = require('./security');

// Claude Agent SDK — ESM dynamic import from CommonJS
let sdkPromise;
function getSDK() {
  if (!sdkPromise) sdkPromise = import('@anthropic-ai/claude-agent-sdk');
  return sdkPromise;
}
// Allow tests to inject a mock SDK
function _setSDKForTesting(mockSDK) {
  sdkPromise = Promise.resolve(mockSDK);
}
const sandbox = require('./sandbox');
const googleAuth = require('./google-auth');
const microsoftAuth = require('./microsoft-auth');
const resendAuth = require('./resend-auth');
const githubAuth = require('./github-auth');
const shopifyAuth = require('./shopify-auth');
const freetoolsAuth = require('./freetools-auth');
const activity = require('./activity-logger');
const agents = require('./agents');
const conversation = require('./conversation-logger');

// Persistent state file — survives bot restarts
const STATE_FILE = path.join(config.stateDir, 'bot_state.json');

// Per-chat session tracking (chatId:agentId -> sessionId)
const sessions = new Map();

// Per-chat project directory (chatId -> directory path)
const projectDirs = new Map();

// Active agent per chat (chatId -> agentId)
const activeAgents = new Map();

// Per-chat model override (chatId -> model string)
const chatModels = new Map();

// Active SDK queries per chat (chatId -> { abortController, startTime, prompt })
const activeQueries = new Map();

// Task history per chat (chatId -> array of last 5 completed tasks)
const taskHistory = new Map();

// Per-chat token usage counters (chatId -> { input, output, tasks })
const tokenCounters = new Map();

// Chats that have already received the welcome message
const greetedChats = new Set();

// Users with active subscriptions (phone numbers like "1234567890@c.us")
const subscribedUsers = new Set();

// Groups with their own isolated sandbox (keyed by chatId instead of senderId)
const isolatedGroups = new Set();

// Task persistence for crash recovery
const pendingTasks = new Map();    // chatId -> task descriptor (in-progress tasks)
const persistedQueue = new Map();  // chatId -> [queue entries] (waiting messages)

// --- Global concurrency limiter for Claude SDK queries ---
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
          logger.info(`Restored project mapping: ${chatId} \u2192 ${dir}`);
        }
      }
      if (data.sessions) {
        for (const [chatId, sessionId] of Object.entries(data.sessions)) {
          sessions.set(chatId, sessionId);
          logger.info(`Restored session: ${chatId} \u2192 ${sessionId}`);
        }
      }
      if (data.chatModels) {
        for (const [chatId, model] of Object.entries(data.chatModels)) {
          chatModels.set(chatId, model);
          logger.info(`Restored model: ${chatId} \u2192 ${model}`);
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
      if (data.activeAgents) {
        for (const [chatId, agentId] of Object.entries(data.activeAgents)) {
          activeAgents.set(chatId, agentId);
        }
      }
      if (data.isolatedGroups) {
        for (const chatId of data.isolatedGroups) {
          isolatedGroups.add(chatId);
        }
      }
      // Migrate legacy sessions: keys without ':' become ':general'
      const legacyKeys = [];
      for (const key of sessions.keys()) {
        if (!key.includes(':')) legacyKeys.push(key);
      }
      for (const key of legacyKeys) {
        const sessionId = sessions.get(key);
        sessions.delete(key);
        sessions.set(`${key}:general`, sessionId);
        logger.info(`Migrated session key: ${key} \u2192 ${key}:general`);
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
      activeAgents: Object.fromEntries(activeAgents),
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

// Log Claude CLI version on startup for debugging
try {
  const { execFileSync } = require('child_process');
  const ver = execFileSync(config.claudePath, ['--version'], { timeout: 10000, encoding: 'utf8' }).trim();
  logger.info(`Claude CLI version: ${ver}`);
} catch (e) {
  logger.warn(`Could not detect Claude CLI version: ${e.message}`);
}

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
- You are a personal AI assistant. You don't have a specific brand name \u2014 just a helpful assistant.
- If asked "who are you?" or "what are you?", say something like: "I'm your personal AI assistant \u2014 here to help you with whatever you need. Think of me as a teammate who never sleeps."
- Keep it casual, friendly, and confident. You exist to help them tame their chaos.

MEMORY & CONTINUITY:
- After every significant task, decision, or discussion, update the project's CLAUDE.md file with what was done, key decisions made, and current state.
- If CLAUDE.md doesn't exist in the project directory, create it with a clear structure.
- Keep CLAUDE.md concise but complete \u2014 it's the memory that persists across sessions.
- Structure CLAUDE.md with sections like: ## Project Overview, ## Architecture, ## Current State, ## Key Decisions, ## Recent Changes, ## TODO
- When resuming work, always read CLAUDE.md first to understand where we left off.
- Save reusable patterns, gotchas, and lessons learned so future sessions don't repeat mistakes.

WEB SEARCH:
- You have access to WebSearch and WebFetch tools. USE THEM.
- When the user asks about current events, news, recent happenings, or ANYTHING beyond your knowledge cutoff \u2014 ALWAYS search the web first before responding.
- NEVER say "my knowledge cuts off at..." without first attempting a web search.
- For news, current events, stock prices, weather, sports scores, or any time-sensitive information \u2014 search first, then answer.
- Use WebFetch to read specific URLs the user shares or that you find via search.

FORMATTING (CRITICAL \u2014 you're on WhatsApp, not a terminal):
- Bold: *text* (NOT **text**)
- Italic: _text_ (NOT *text* with single asterisks)
- Strikethrough: ~text~
- Monospace: \`text\` (single backticks only \u2014 triple backticks show as literal \`\`\`)
- NO markdown headers (##, ###). Use *Bold Title* on its own line instead.
- NO markdown links [text](url). Just paste the URL directly.
- NO bullet points with - or *. Use \u2022 (bullet character) or numbered lists.
- Keep messages concise. No walls of text.

WORKING STYLE:
- Act autonomously. Don't ask for permission \u2014 just do the work.
- Only ask before deleting/removing things.
- When you complete a task, briefly confirm what was done.
- Keep responses concise \u2014 this is WhatsApp, not a terminal.

SCHEDULING & REMINDERS:
When a user asks to be reminded of something, get notified at a certain time, or set up a recurring task, include a special tag in your response. The system processes this tag automatically \u2014 the user will NOT see it.

For simple reminders (just sends the message text, no AI processing):
<<REMIND|time_expression|reminder message>>

For tasks that need AI to do something (runs through AI each time):
<<SCHEDULE|time_expression|task prompt>>

Time expressions you can use:
\u2022 "daily HH:MM" \u2014 every day at that time (24h format), e.g. "daily 18:00"
\u2022 "daily H:MMam/pm" \u2014 e.g. "daily 6:00pm"
\u2022 "weekdays HH:MM" \u2014 Monday through Friday
\u2022 "weekends HH:MM" \u2014 Saturday and Sunday
\u2022 "every monday HH:MM" \u2014 a specific day of week (full name: monday, tuesday, etc.)
\u2022 "every Nh" or "every Nm" \u2014 interval (e.g. "every 2h", "every 30m")
\u2022 Raw cron for advanced cases: "0 18 * * *"

Rules:
\u2022 Always place the tag at the END of your message, on its own line.
\u2022 Always confirm what you set up in your natural language response BEFORE the tag.
\u2022 Use REMIND for simple reminders/notifications. Use SCHEDULE for tasks that need AI work (e.g. "check my emails", "summarize the news").
\u2022 The reminder/task prompt should be the actual message or instruction \u2014 not a description of the schedule.

Examples:
User: "remind me every day at 6pm to exercise"
\u2192 "Done! I'll remind you every day at 6:00 PM to exercise.
<<REMIND|daily 18:00|Time to exercise! Stay consistent with your fitness goals \ud83d\udcaa>>"

User: "every weekday at 9am, check my emails and give me a summary"
\u2192 "All set! I'll check and summarize your emails every weekday morning at 9:00 AM.
<<SCHEDULE|weekdays 9:00|Check the user's emails and provide a brief summary of important messages>>"

User: "remind me every monday at 10am to submit my timesheet"
\u2192 "Got it! Weekly reminder set for Monday at 10:00 AM.
<<REMIND|every monday 10:00|Reminder: Submit your timesheet! Don't forget to log all your hours for last week.>>"

${SECURITY_SYSTEM_PROMPT}
`;

async function runClaude(prompt, chatId, sandboxKey, _isRetry = false, opts = {}) {
  const { query: sdkQuery } = await getSDK();

  // Wait for a concurrency slot
  await acquireClaudeSlot();

  const model = getChatModel(chatId) || config.claudeModel;

  // Agent-aware session key: chatId:agentId
  const agentId = activeAgents.get(chatId) || agents.getDefaultAgentId();
  const sessionKey = `${chatId}:${agentId}`;

  let sessionId = null;
  if (config.enableSessions) {
    sessionId = sessions.get(sessionKey) || null;
  }
  const hasSession = !!sessionId;

  // Build MCP config — all integrations use host paths (no bwrap)
  let googlePrompt = '';
  const mcpServers = {};
  const nodePath = config.nodeBinaryPath;
  const apiUrl = `http://localhost:${config.httpPort}`;

  // Resend MCP — per-user API key
  const resendApiKey = resendAuth.resolveApiKey(chatId);
  if (resendApiKey) {
    mcpServers.resend = {
      command: nodePath,
      args: [path.resolve(config.resendMcpPath)],
      env: { RESEND_API_KEY: resendApiKey },
    };
  }

  // Google MCP — only when user has connected their Google account
  if (googleAuth.isConfigured()) {
    const googleStatus = googleAuth.getStatus(chatId);

    if (googleStatus.connected) {
      mcpServers.google = {
        command: nodePath,
        args: [path.resolve(config.mcpServerPath)],
        env: { CHAT_ID: chatId, BOT_API_URL: apiUrl },
      };

      googlePrompt = `
GOOGLE INTEGRATION: Connected as ${googleStatus.email}. You have MCP tools for Gmail, Drive, Sheets, and Docs \u2014 use them directly instead of curl.
GUIDELINES:
- When the user asks to send an email, compose and send directly. Don't ask for confirmation unless ambiguous.
- Gmail "query" param accepts Gmail search syntax (e.g. "from:user@example.com", "is:unread", "subject:invoice").
- Drive "query" param accepts Drive search syntax (e.g. "name contains 'report'", "mimeType='application/pdf'").
- For Sheets, "range" uses A1 notation (e.g. "Sheet1!A1:D10"). "values" is a 2D array of strings.
- NEVER suggest app passwords, SMTP setup, OAuth client creation, or any manual Gmail configuration. You already have a built-in integration \u2014 use it.
FILE OUTPUT: When asked to create documents, reports, PDFs, images, or any files \u2014 ALWAYS save them locally in the current working directory (NOT to Google Drive). The bot will automatically deliver files to the user via WhatsApp. Only use drive_upload when the user explicitly asks to upload to Drive.
INVOICE PDF TOOL: To generate invoice PDFs, run: node /opt/tools/invoice-pdf.js '<JSON>' where JSON has: invoiceNumber, date, dueDate, from:{name,email}, to:{name,email}, items:[{description,quantity,rate,amount}], subtotal, tax, total. The PDF is saved in the current directory and auto-delivered to the user. ALWAYS use this tool for invoices \u2014 never pretend to create a PDF without running this command.
`;
    } else {
      googlePrompt = `
GOOGLE INTEGRATION (NOT YET CONNECTED):
If the user asks about email, Gmail, Google Drive, Google Docs, or Google Sheets \u2014 tell them to type /gmail login to connect their Google account.
NEVER suggest app passwords, SMTP setup, OAuth client creation, or any manual configuration. The built-in integration handles everything automatically.
`;
    }
  }

  // Outlook MCP — only when user has connected their Microsoft account
  let outlookPrompt = '';
  if (microsoftAuth.isConfigured()) {
    const outlookStatus = microsoftAuth.getStatus(chatId);

    if (outlookStatus.connected) {
      mcpServers.outlook = {
        command: nodePath,
        args: [path.resolve(config.outlookMcpServerPath)],
        env: { CHAT_ID: chatId, BOT_API_URL: apiUrl },
      };

      outlookPrompt = `
OUTLOOK INTEGRATION: Connected as ${outlookStatus.email}. You have MCP tools for Outlook Mail \u2014 use them directly.
GUIDELINES:
- When the user asks to send an email via Outlook, compose and send directly. Don't ask for confirmation unless ambiguous.
- Use outlook_inbox with "query" for searching (Microsoft search syntax, e.g. "from:user@example.com", "subject:invoice").
- Use outlook_reply/outlook_forward for replies and forwards.
- Use outlook_folders to list available folders and outlook_move to organize emails.
- NEVER suggest app passwords, SMTP setup, or manual configuration. You already have a built-in integration \u2014 use it.
`;
    } else {
      outlookPrompt = `
OUTLOOK INTEGRATION (NOT YET CONNECTED):
If the user asks about Outlook email \u2014 tell them to type /outlook login to connect their Microsoft account.
NEVER suggest app passwords, SMTP setup, or any manual configuration. The built-in integration handles everything automatically.
`;
    }
  }

  // Shopify MCP — only when user has connected their Shopify store
  let shopifyPrompt = '';
  if (shopifyAuth.isConfigured()) {
    const shopifyStatus = shopifyAuth.getStatus(chatId);

    if (shopifyStatus.connected) {
      mcpServers.shopify = {
        command: nodePath,
        args: [path.resolve(config.shopifyMcpPath)],
        env: { CHAT_ID: chatId, BOT_API_URL: apiUrl },
      };

      shopifyPrompt = `
SHOPIFY INTEGRATION: Connected to store "${shopifyStatus.shopName || shopifyStatus.shop}". You have MCP tools to manage their Shopify store — use them directly.
GUIDELINES:
- Products: List, create, update, delete products. Include variants (sizes/colors) when creating.
- Orders: List, view details, fulfill (with tracking), cancel orders.
- Customers: Search and view customer details.
- Inventory: Set stock quantities at locations. Use shopify_list_locations first to get location IDs.
- Discounts: Create percentage or fixed-amount discount codes.
- Draft Orders: Create custom invoices/manual orders.
- When creating products, default status to "active" unless told otherwise.
- When fulfilling orders, always ask for tracking number if not provided.
- For inventory updates, you need the inventoryItemId from the product variant and a locationId.
`;
    } else {
      shopifyPrompt = `
SHOPIFY INTEGRATION (NOT YET CONNECTED):
If the user asks about their Shopify store, products, orders, or anything e-commerce related — tell them to type /shopify login <shop> to connect their store.
Example: /shopify login mystore.myshopify.com
`;
    }
  }

  // Playwright MCP — only for tasks that genuinely need interactive browser automation
  const NEEDS_BROWSER = /\b(take\s+a?\s*screenshot|screenshot\s+of|fill\s+(out\s+)?(the\s+)?form|submit\s+(the\s+)?form|log\s*in\s+to|sign\s*in\s+to|click\s+(the\s+|on\s+)?button|automate\s+(the\s+)?(website|page|site|browser)|browser\s+automation|interact\s+with\s+(the\s+)?(page|site|website))\b/i;
  if (NEEDS_BROWSER.test(prompt) || opts.useBrowser) {
    mcpServers.playwright = {
      command: nodePath,
      args: [path.resolve(config.playwrightMcpPath), '--headless'],
      env: {
        PLAYWRIGHT_BROWSERS_PATH: config.playwrightBrowsersPath,
      },
    };
  }

  // Trading MCP — always active when using paper-trader agent
  if (agentId === 'paper-trader') {
    const { base } = sandbox.ensureSandboxDirs(sandboxKey || chatId);
    const agentWorkspace = agents.ensureAgentWorkspace(base, 'paper-trader');
    mcpServers.trading = {
      command: nodePath,
      args: [path.resolve(config.tradingMcpPath)],
      env: { PORTFOLIO_PATH: path.join(agentWorkspace, 'portfolio.json') },
    };
  }

  // Job Hunter MCP — always active when using job-hunter agent
  if (agentId === 'job-hunter') {
    const { base } = sandbox.ensureSandboxDirs(sandboxKey || chatId);
    const agentWorkspace = agents.ensureAgentWorkspace(base, 'job-hunter');
    mcpServers.jobhunter = {
      command: nodePath,
      args: [path.resolve(config.jobHunterMcpPath)],
      env: { TRACKER_PATH: path.join(agentWorkspace, 'tracker.json'), CHAT_ID: chatId, BOT_API_URL: apiUrl },
    };
  }

  // Real Estate MCP — always active when using real-estate agent
  if (agentId === 'real-estate') {
    const { base } = sandbox.ensureSandboxDirs(sandboxKey || chatId);
    const agentWorkspace = agents.ensureAgentWorkspace(base, 'real-estate');
    mcpServers.realestate = {
      command: nodePath,
      args: [path.resolve(config.realestateMcpPath)],
      env: {
        DATA_PATH: path.join(agentWorkspace, 'realestate-data.json'),
        BOT_API_URL: apiUrl,
        CHAT_ID: chatId,
        FUB_API_KEY: config.fubApiKey || '',
        MLS_API_URL: config.mlsApiUrl || '',
        MLS_API_TOKEN: config.mlsApiToken || '',
        ATTOM_API_KEY: config.attomApiKey || '',
        WALKSCORE_API_KEY: config.walkscoreApiKey || '',
        GREATSCHOOLS_API_KEY: config.greatschoolsApiKey || '',
        FRED_API_KEY: config.fredApiKey || '',
      },
    };
  }

  // Real Estate prompt
  let realestatePrompt = '';
  if (mcpServers.realestate) {
    realestatePrompt = `
REAL ESTATE CRM: You have 57 MCP tools for managing a complete real estate business. ALWAYS use these tools \u2014 never fabricate data. All data persists across sessions.

LEAD MANAGEMENT: lead_add, lead_list, lead_view, lead_update, lead_delete, lead_qualify, lead_search, lead_conversation_log, lead_bulk_action, crm_sync, lead_consent_track
PROPERTIES: property_add, property_list, property_update, property_match, property_compare, mls_search, neighborhood_data
SHOWINGS: showing_schedule, showing_list, showing_update
FOLLOW-UPS: followup_add, followup_list, followup_complete
NURTURE: nurture_create, nurture_list, nurture_enroll, nurture_status, nurture_pause, nurture_process
LEAD GENERATION: leadgen_buyer_campaign, leadgen_social_content, leadgen_seller_valuation, leadgen_just_sold, leadgen_market_report, leadgen_expired_fsbo, leadgen_referral_create, leadgen_referral_stats, leadgen_stats
MARKETING: listing_generate, listing_publish, listing_campaign, listing_video_create
VALUATIONS: valuation_estimate, valuation_to_lead, valuation_list
CMA: get_comparable_sales, generate_cma, get_mortgage_rates
TRANSACTIONS: transaction_create, transaction_status, transaction_update, transaction_list, deadline_reminder, document_checklist
DASHBOARD: pipeline_stats

KEY WORKFLOWS:
- New lead \u2192 lead_add \u2192 lead_qualify \u2192 ask BANT questions \u2192 property_match \u2192 schedule showing
- Marketing \u2192 listing_generate \u2192 listing_campaign \u2192 listing_publish (social/email/whatsapp)
- Lead gen \u2192 leadgen_buyer_campaign or leadgen_seller_valuation \u2192 publish \u2192 track with leadgen_stats
- Valuation \u2192 valuation_estimate \u2192 valuation_to_lead \u2192 nurture_enroll
- Transaction \u2192 transaction_create \u2192 track deadlines \u2192 document_checklist \u2192 transaction_update (closed)
- Start sessions by checking pipeline_stats, followup_list, nurture_status, and deadline_reminder.
`;
  }

  // Trading prompt
  let tradingPrompt = '';
  if (mcpServers.trading) {
    tradingPrompt = `
PAPER TRADING: You have MCP tools for paper trading with real market data. Use trade_buy, trade_sell, portfolio_view, market_quote, market_search, options_chain, trade_history, and portfolio_reset. ALWAYS use these tools \u2014 never fabricate prices. The portfolio persists across sessions.
`;
  }

  // Job Hunter prompt
  let jobHunterPrompt = '';
  if (mcpServers.jobhunter) {
    jobHunterPrompt = `
JOB HUNTER: You have MCP tools for job searching and application tracking. Use job_search, job_details, company_info, tracker_add, tracker_list, tracker_update, and tracker_stats. ALWAYS use job_search for finding jobs \u2014 never fabricate listings. When the user mentions applying somewhere, use tracker_add. The tracker persists across sessions.
`;
  }

  // Playwright prompt
  let playwrightPrompt = '';
  if (mcpServers.playwright) {
    playwrightPrompt = `
BROWSER AUTOMATION: You have Playwright MCP tools available RIGHT NOW. Use them to take screenshots, navigate pages, click elements, fill forms, etc. Do NOT say you can't take screenshots \u2014 you CAN. Use the playwright tools.
`;
  }

  // Resend prompt
  let resendPrompt = '';
  if (resendApiKey) {
    resendPrompt = `
RESEND EMAIL: You have MCP tools from Resend for sending emails, managing contacts, domains, and more. Use the Resend tools (e.g. send-email) when the user asks to send emails via Resend.
COMMANDS: /resend status \u2014 check connection, /resend disconnect \u2014 remove API key and disconnect.
IMPORTANT: Never create or delete API keys without explicit user confirmation. Never expose the user's API key in your response.
`;
  } else {
    resendPrompt = `
RESEND EMAIL (NOT YET CONNECTED):
If the user asks about sending emails via Resend \u2014 tell them to type /resend to set up their Resend API key.
COMMANDS: /resend \u2014 setup guide, /resend setup <api-key> \u2014 connect account, /resend disconnect \u2014 remove API key.
Do NOT attempt to use Resend tools \u2014 they are not available until the user connects their account.
`;
  }

  // GitHub MCP — only when user has connected their GitHub account
  let githubPrompt = '';
  if (githubAuth.isConfigured()) {
    const ghStatus = githubAuth.getStatus(chatId);
    if (ghStatus.connected) {
      mcpServers.github = {
        command: nodePath,
        args: [path.resolve(config.githubMcpServerPath)],
        env: { CHAT_ID: chatId, BOT_API_URL: apiUrl },
      };

      githubPrompt = `
GITHUB INTEGRATION: Connected as ${ghStatus.account}. You have MCP tools for GitHub \u2014 use them to list repos, read/write files, create branches, open PRs, manage issues, and search code.
GUIDELINES:
- Use github_list_repos to see available repos.
- Use github_get_file / github_list_files to browse repo contents.
- Use github_create_or_update_file to create or modify files. For updates, you MUST provide the file's current SHA (get it from github_get_file first).
- Use github_create_branch before making changes if the user wants a separate branch.
- Use github_create_pr to open pull requests after making changes on a branch.
- Use github_list_issues / github_create_issue to manage issues.
- Use github_search_code to find code across repos.
- The "repo" parameter always uses "owner/repo" format (e.g. "octocat/hello-world").
COMMANDS: /repos \u2014 list connected repos, /repo <name> \u2014 clone and set active repo, /github disconnect \u2014 remove connection.
`;
    } else {
      githubPrompt = `
GITHUB INTEGRATION (NOT YET CONNECTED):
If the user asks about working with GitHub repos, coding on their repos, committing code, or managing repositories \u2014 tell them to type /github to connect their GitHub account. They'll choose which repos to give access to.
CAPABILITIES once connected: Browse repo files, create/update files, create branches, open PRs, manage issues, search code \u2014 all via MCP tools.
COMMANDS: /github \u2014 connect GitHub account, /repos \u2014 list repos, /repo <name> \u2014 set active repo.
`;
    }
  }

  // FreeTools MCP — social media publishing (always active, auto-provisions account)
  let freetoolsPrompt = '';
  try {
    freetoolsAuth.getStatus(chatId);
    mcpServers.freetools = {
      command: nodePath,
      args: [path.resolve(config.freetoolsMcpPath)],
      env: { CHAT_ID: chatId, BOT_API_URL: apiUrl },
    };

    freetoolsPrompt = `
SOCIAL PUBLISHING: You have MCP tools to post and manage content on social media (X/Twitter, LinkedIn, Instagram) via freetools.us.
WORKFLOW \u2014 always follow this order:
1. ALWAYS call social_list_accounts FIRST \u2014 this is the live source of truth. Never assume from memory or conversation history.
2. If accounts are returned, use their IDs with social_publish_now or social_schedule_post.
3. Only if social_list_accounts returns empty, use social_get_connect_url and send the OAuth link to the user.
CRITICAL RULES:
- NEVER tell the user to connect if you haven't called social_list_accounts first \u2014 they may already be connected.
- NEVER fabricate account IDs \u2014 always get them from social_list_accounts.
- When asked to post to LinkedIn/X/Instagram \u2014 call social_list_accounts immediately, then publish.
- Supported platforms: TWITTER, LINKEDIN, INSTAGRAM.
MEDIA ATTACHMENTS: To attach images or videos to social posts, use the "filePath" parameter with the local filename (e.g. filePath: "video.mp4"). The bot automatically makes it publicly accessible \u2014 do NOT ask the user for a public URL or suggest uploading to Drive. Also set mediaType to "IMAGE" or "VIDEO" accordingly.
COMMANDS: /social \u2014 show connected accounts, /social connect <platform> \u2014 connect account, /social posts \u2014 list posts.
`;
  } catch (e) {
    logger.warn(`FreeTools MCP setup failed: ${e.message}`);
  }

  // GitHub repo context — tell Claude it can commit and push when inside a git repo
  const projectDir = getProjectDir(chatId);
  if (projectDir) {
    try {
      const gitDir = path.join(projectDir, '.git');
      if (fs.existsSync(gitDir)) {
        githubPrompt += `
ACTIVE REPO: You are working in a cloned GitHub repository at the current directory. You can edit files, then commit and push.
WORKFLOW: Make changes \u2192 git add <files> \u2192 git commit -m "descriptive message" \u2192 git push
IMPORTANT: Always check git status before starting. Use descriptive commit messages. The push will trigger CI/CD deployment if configured.
NEVER force push or rewrite history. Only push to the default branch.
`;
      }
    } catch {}
  }

  // Build the integration context
  const integrationContext = realestatePrompt + tradingPrompt + jobHunterPrompt + playwrightPrompt + resendPrompt + googlePrompt + outlookPrompt + shopifyPrompt + githubPrompt + freetoolsPrompt;

  // For resumed sessions, prepend integration context to prompt
  // For new sessions, use SDK's systemPrompt option (proper system prompt mechanism)
  const fullPrompt = hasSession
    ? (integrationContext + prompt)
    : prompt;

  const systemPrompt = hasSession
    ? undefined
    : (MEMORY_SYSTEM_PROMPT + integrationContext);

  // Use user-set project dir, or agent-specific workspace
  let cwd = getProjectDir(chatId);
  if (!cwd) {
    const { base } = sandbox.ensureSandboxDirs(sandboxKey || chatId);
    cwd = agents.ensureAgentWorkspace(base, agentId);
  }

  // Refresh GitHub credentials if working in a git repo
  if (cwd) {
    try {
      const gitDir = path.join(cwd, '.git');
      const credPath = path.join(cwd, '.git-credentials');
      if (fs.existsSync(gitDir) && fs.existsSync(credPath)) {
        const ghAuth = require('./github-auth');
        if (ghAuth.isConfigured()) {
          const ghStatus = ghAuth.getStatus(chatId);
          if (ghStatus.connected) {
            const { token } = await ghAuth.generateInstallationToken(chatId);
            fs.writeFileSync(credPath, `https://x-access-token:${token}@github.com\n`, { mode: 0o600 });
          }
        }
      }
    } catch (e) {
      logger.warn(`Failed to refresh git credentials: ${e.message}`);
    }
  }

  const sbKey = sandboxKey || chatId;
  const promptPreview = prompt.slice(0, 80).replace(/\n/g, ' ');

  // Log user message to conversation history (skip on retry to avoid duplicates)
  if (!_isRetry) {
    conversation.logEntry(sbKey, agentId, 'user', prompt);
  }

  // Log task start to activity tracker
  activity.logTaskStart(chatId, {
    agentId,
    model,
    sessionId,
    project: cwd,
    promptPreview: prompt.slice(0, 200),
    sandbox: 'sdk',
  });

  logger.info(`SDK query [${runningClaudeCount}/${MAX_CONCURRENT_CLAUDE}] cwd=${cwd} model=${model} session=${sessionId || 'new'} agent=${agentId}`);

  // Set up abort controller for /stop support
  const abortController = new AbortController();

  // Build SDK options
  const sdkOptions = {
    model,
    cwd,
    permissionMode: 'bypassPermissions',
    abortController,
  };

  if (systemPrompt) {
    sdkOptions.systemPrompt = systemPrompt;
  }

  // Resume existing session
  if (hasSession) {
    sdkOptions.resume = sessionId;
  }

  // Add MCP servers if any are configured
  if (Object.keys(mcpServers).length > 0) {
    sdkOptions.mcpServers = mcpServers;
  }

  // Track active query for /stop
  activeQueries.set(chatId, { abortController, startTime: Date.now(), prompt: promptPreview });

  // Timeout handling
  let timeoutTimer = null;
  if (config.commandTimeoutMs > 0) {
    timeoutTimer = setTimeout(() => {
      abortController.abort();
    }, config.commandTimeoutMs);
  }

  try {
    const queryHandle = sdkQuery({ prompt: fullPrompt, options: sdkOptions });

    let resultText = '';
    let pendingText = '';
    let lastFlushTime = Date.now();
    let newSessionId = null;
    let tokens = null;
    const FLUSH_INTERVAL_MS = 3000;

    for await (const message of queryHandle) {
      // Capture session ID from init message
      if (message.type === 'system' && message.subtype === 'init') {
        newSessionId = message.session_id;
      }

      // Stream assistant text as it arrives
      if (message.type === 'assistant' && message.content) {
        for (const block of message.content) {
          if (block.type === 'text') {
            pendingText += block.text;
            resultText += block.text;

            const now = Date.now();
            if (opts.onStream && (now - lastFlushTime > FLUSH_INTERVAL_MS || pendingText.includes('\n\n'))) {
              await opts.onStream(pendingText);
              pendingText = '';
              lastFlushTime = now;
            }
          }
        }
      }

      // Flush pending text before tool use (so user sees partial response)
      if (message.type === 'tool_use' && opts.onStream && pendingText) {
        await opts.onStream(pendingText);
        pendingText = '';
        lastFlushTime = Date.now();
      }

      // Final result message
      if (message.type === 'result') {
        newSessionId = message.session_id || newSessionId;

        if (message.result) {
          resultText = message.result;
        }

        if (message.usage) {
          tokens = {
            input: message.usage.input_tokens || 0,
            output: message.usage.output_tokens || 0,
            cacheCreation: message.usage.cache_creation_input_tokens || 0,
            cacheRead: message.usage.cache_read_input_tokens || 0,
          };
        }
        if (message.total_cost_usd != null) {
          if (!tokens) tokens = { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 };
          tokens.costUsd = message.total_cost_usd;
        }
        if (message.duration_api_ms != null) {
          if (!tokens) tokens = { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 };
          tokens.apiDurationMs = message.duration_api_ms;
        }
        if (message.num_turns != null) {
          if (!tokens) tokens = { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 };
          tokens.numTurns = message.num_turns;
        }
      }
    }

    // Flush any remaining streamed text
    if (pendingText && opts.onStream) {
      await opts.onStream(pendingText);
    }

    // Save session
    if (newSessionId) {
      sessions.set(sessionKey, newSessionId);
      saveState();
      if (!hasSession) {
        logger.info(`New session created for ${agentId}: ${newSessionId}`);
        activity.logSession(chatId, { agentId, action: 'create', sessionId: newSessionId });
      }
    }

    const endTime = Date.now();
    const startTime = activeQueries.get(chatId)?.startTime || endTime;
    const durationSecs = Math.round((endTime - startTime) / 1000);

    addTaskHistory(chatId, { prompt: promptPreview, startTime, endTime, durationSecs, tokens, status: 'completed' });

    // Log assistant response to conversation history
    conversation.logEntry(sbKey, agentId, 'assistant', resultText);

    // Filter sensitive content from output before sending to WhatsApp
    const filtered = filterSensitiveOutput(resultText);
    if (filtered.redacted) {
      logger.warn(`Sensitive content redacted from Claude output (${chatId}): ${filtered.labels.join(', ')}`);
    }

    return sanitizePaths(filtered.text);

  } catch (err) {
    const endTime = Date.now();
    const entry = activeQueries.get(chatId);
    const startTime = entry?.startTime || endTime;
    const durationSecs = Math.round((endTime - startTime) / 1000);

    // Detect user-initiated abort or timeout
    if (err.name === 'AbortError' || abortController.signal.aborted) {
      addTaskHistory(chatId, { prompt: promptPreview, startTime, endTime, durationSecs, tokens: null, status: 'stopped' });
      throw new Error('STOPPED_BY_USER');
    }

    // Retry with fresh session if resume failed (stale/expired session)
    if (hasSession && !_isRetry) {
      logger.warn(`Resume failed for ${chatId}: ${err.message?.slice(0, 200)}`);
      clearSession(chatId);

      const history = conversation.loadHistory(sbKey, agentId);
      let retryPrompt = prompt;
      if (history.length > 0) {
        const historyContext = conversation.formatHistoryAsContext(history);
        retryPrompt = historyContext + prompt;
        logger.info(`Injecting ${history.length} conversation history entries for ${chatId} retry`);
      }

      return new Promise(resolve => {
        setTimeout(() => resolve(runClaude(retryPrompt, chatId, sandboxKey, true)), 1000);
      });
    }

    // Classify the error for debugging
    const errorDetail = err.message || '';
    const isAuthError = /auth|token|oauth|401|403|credential|expired|refresh|unauthorized|login/i.test(errorDetail);
    const isRateLimit = /rate.?limit|429|too many|throttl/i.test(errorDetail);
    const isOOM = /memory|oom|killed|signal 9/i.test(errorDetail);

    let errorType = 'unknown';
    if (isAuthError) errorType = 'AUTH';
    else if (isRateLimit) errorType = 'RATE_LIMIT';
    else if (isOOM) errorType = 'OOM';

    logger.error(`SDK query [${errorType}] failed for ${chatId}: ${errorDetail.slice(0, 500)}`);

    addTaskHistory(chatId, { prompt: promptPreview, startTime, endTime, durationSecs, tokens: null, status: 'error' });
    throw new Error(`Claude error: ${errorDetail.slice(0, 200)}`);

  } finally {
    if (timeoutTimer) clearTimeout(timeoutTimer);
    activeQueries.delete(chatId);
    releaseClaudeSlot();
  }
}

function clearSession(chatId) {
  const agentId = activeAgents.get(chatId) || agents.getDefaultAgentId();
  const sessionKey = `${chatId}:${agentId}`;
  sessions.delete(sessionKey);
  saveState();
  activity.logSession(chatId, { agentId, action: 'reset' });
}

// Abort the active SDK query for a chat (user-initiated stop)
function stopClaude(chatId) {
  const entry = activeQueries.get(chatId);
  if (!entry) return false;

  entry.abortController.abort();
  activeQueries.delete(chatId);
  logger.info(`Query stopped by user for chat ${chatId}`);
  return true;
}

function isRunning(chatId) {
  return activeQueries.has(chatId);
}

// Get info about the running task for /status
function getRunningInfo(chatId) {
  const entry = activeQueries.get(chatId);
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

  // Log task completion to activity tracker
  const agentId = activeAgents.get(chatId) || agents.getDefaultAgentId();
  activity.logTaskEnd(chatId, {
    agentId,
    status: entry.status,
    durationSecs: entry.durationSecs,
    tokens: entry.tokens,
    model: getChatModel(chatId) || config.claudeModel,
    error: entry.status === 'error' ? entry.prompt : null,
  });

  // Sync task delta to DB
  const dbDelta = {
    tasks: 1,
    completedTasks: entry.status === 'completed' ? 1 : 0,
    failedTasks: entry.status === 'error' ? 1 : 0,
    stoppedTasks: entry.status === 'stopped' ? 1 : 0,
    durationSecs: entry.durationSecs || 0,
  };
  if (entry.tokens) {
    dbDelta.inputTokens = entry.tokens.input || 0;
    dbDelta.outputTokens = entry.tokens.output || 0;
    dbDelta.cacheCreationTokens = entry.tokens.cacheCreation || 0;
    dbDelta.cacheReadTokens = entry.tokens.cacheRead || 0;
    dbDelta.costUsd = entry.tokens.costUsd || 0;
  }
  activity.syncToDb(chatId, dbDelta);

  // Also accumulate lifetime token usage
  if (entry.tokens) {
    addTokenUsage(chatId, entry.tokens);
  }
}

function getTaskHistory(chatId) {
  return taskHistory.get(chatId) || [];
}

// \u2500\u2500 Token usage counters \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

function addTokenUsage(chatId, tokens) {
  if (!tokens) return;
  const c = tokenCounters.get(chatId) || {
    input: 0, output: 0, cacheCreation: 0, cacheRead: 0,
    costUsd: 0, tasks: 0,
  };
  c.input += tokens.input || 0;
  c.output += tokens.output || 0;
  c.cacheCreation += tokens.cacheCreation || 0;
  c.cacheRead += tokens.cacheRead || 0;
  c.costUsd += tokens.costUsd || 0;
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

// \u2500\u2500 Subscription management \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

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

// \u2500\u2500 Agent management \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

function getUserAgent(chatId) {
  return activeAgents.get(chatId) || agents.getDefaultAgentId();
}

function getAllChatIds() {
  return Array.from(activeAgents.keys());
}

function setUserAgent(chatId, agentId) {
  activeAgents.set(chatId, agentId);
  saveState();
  logger.info(`Agent set for ${chatId}: ${agentId}`);
}

// \u2500\u2500 Group isolation \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

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
 * - DMs: senderId (one sandbox per user)
 * - Groups (default): owner's senderId (same sandbox as their DM)
 * - Groups (isolated): chatId (group gets its own sandbox)
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
  getUserAgent, setUserAgent, getAllChatIds,
  setPendingTask, clearPendingTask, getPendingTasks,
  setPersistedQueue, getPersistedQueue, clearPersistedQueue,
  clearConversationHistory: conversation.clearHistory,
  _setSDKForTesting,
};
