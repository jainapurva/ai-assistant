# AI Assistant — WhatsApp Bot

Standalone WhatsApp AI assistant powered by Claude, using Meta's Cloud API. Runs headlessly with no browser, connecting via Meta's official webhook + Graph API.

## Architecture
```
src/
├── index.js       — Message routing, commands, polls, HTTP API
├── claude.js      — Claude CLI bridge, session/project/model management, state persistence
├── config.js      — Loads .env, exposes settings (model, open access, etc.)
├── sandbox.js     — Per-user Docker sandbox (container lifecycle, disk monitoring, idle reaping)
├── scheduler.js   — Cron-based scheduled tasks with persistence
├── projects.js    — Scans for CLAUDE.md files, project discovery
├── formatter.js   — ANSI stripping, message chunking (4000 char limit)
├── options.js     — Detects numbered lists → numbered text replies
├── logger.js      — Logging utility
├── security.js    — Credential protection (system prompt, env whitelist, output filter)
├── drive.js       — Google Drive integration
├── profiles.js    — User profiles + registration
├── api-commands.js — /imagine, enable/disable per chat
└── providers/
    ├── base-provider.js      — Abstract EventEmitter provider interface
    ├── cloud-api-provider.js — Meta Cloud API (webhook + Graph API)
    └── index.js              — Factory (creates CloudAPIProvider)
```

## How It Works
1. Meta sends webhook POST to `/webhook` when user messages the bot
2. CloudAPIProvider validates signature, normalizes message, emits `message`
3. index.js routes message → commands or Claude CLI
4. Claude spawned via `claude -p --model <model> --dangerously-skip-permissions`
5. Response chunked to 4000 chars, sent back via Graph API

## Setup
1. Create Meta App at developers.facebook.com
2. Add WhatsApp product, get phone number ID + access token
3. Copy `.env.example` to `.env`, fill in credentials
4. `npm install && node src/index.js`
5. Expose webhook: `cloudflared tunnel --url http://localhost:3000`
6. Set webhook URL in Meta dashboard: `https://<tunnel>/webhook`

## Commands
| Command | Description |
|---------|-------------|
| `/help` | Show help |
| `/status` | Bot status, model, project |
| `/stop` | Stop current task |
| `/stop all` | Stop + clear queue |
| `/reset` | Clear session + project + model + usage |
| `/project <path>` | Set working directory |
| `/projects` | Browse & select projects |
| `/model <name>` | Set model (opus/sonnet/haiku/reset) |
| `/register <name>` | Register user profile |
| `/profile` | View profile |
| `/usage` | Token usage stats |
| `/files` | List & download workspace files |
| `/sandbox` | Sandbox status & disk usage |
| `/sandbox clean` | Clean sandbox workspace |
| `/sandbox reset` | Remove sandbox container (admin) |
| `/imagine <prompt>` | Generate image (DALL-E 3) |
| `/drive` | List Drive files |
| `/schedule` | Schedule recurring tasks |
| `/schedules` | List scheduled tasks |
| `/unschedule` | Remove scheduled tasks |

## Docker Sandbox
Each user gets an isolated Docker container for Claude execution:
- Container: `ai-sandbox-<sha256(chatId)[:12]>`
- Image: `ai-assistant-sandbox:latest` (Ubuntu 22.04, minimal)
- Resource limits: 512MB RAM, 1 CPU, 256 PIDs, 64MB tmpfs /tmp
- Disk monitoring every 5 min, idle reaping after 24h
- Graceful fallback: if Docker unavailable, runs on host

## Future Tasks

### 1. Group chat: mention-only mode for non-subscribers
In a group chat containing a subscribed user, the bot, and other members who are **not** subscribed/registered users of the bot, the bot should **only respond when explicitly addressed by name** (e.g., "add it Claude"). Non-subscriber group members must include the bot's name (e.g., "Claude") in their message for the bot to process it. Subscribed users in the same group can message normally without mentioning the bot's name.
