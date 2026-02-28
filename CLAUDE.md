# AI Assistant — WhatsApp Bot

## Project Overview
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

## State Management
- Single local state file: `bot_state.json` (sessions, projects, models, token counters, schedules)
- All state stored in-memory Maps with periodic persistence to disk
- No shared state, file locking, or distributed locks — single-instance bot

## Setup
1. Create Meta App at developers.facebook.com
2. Add WhatsApp product, get phone number ID + access token
3. Copy `.env.example` to `.env`, fill in credentials
4. `npm install && node src/index.js`
5. Expose webhook: `cloudflared tunnel --url http://localhost:3000`
6. Set webhook URL in Meta dashboard: `https://<tunnel>/webhook`

## Config Defaults
- Model: `claude-sonnet-4-6`
- Open access: `true` (anyone can DM)
- Sessions: enabled by default
- Provider: Cloud API

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

## Internal HTTP API
- `POST /send` — `{ chatId, message }` → sends WhatsApp message
- `GET /health` — returns `{ status: "ok" }`

## Docker Sandbox
Each user gets an isolated Docker container for Claude execution:
- Container: `ai-sandbox-<sha256(chatId)[:12]>`
- Image: `ai-assistant-sandbox:latest` (Ubuntu 22.04, minimal)
- All persistent data via bind mounts (near-zero overlay writes)
- Mounts: Claude binary (ro), workspace (rw), .claude dir (rw), credentials (ro)
- Resource limits: 512MB RAM, 1 CPU, 256 PIDs, 64MB tmpfs /tmp
- Disk monitoring every 5 min, idle reaping after 24h, startup prune
- Host dirs: `/media/ddarji/storage/ai-assistant/sandboxes/<hash>/{workspace,.claude}`
- Graceful fallback: if Docker unavailable, runs on host

## Key Decisions
- Cloud API only — no whatsapp-web.js dependency
- Open access by default — designed for public-facing bot
- `--dangerously-skip-permissions` — Claude runs fully autonomously
- File-based state (not Redis/DB) — simple, no extra infra
- Message queue instead of rejection — better UX for rapid messages

## Storage Policy
- All data storage must be inside `/home/ddarji/dhruvil/storage/` or `/media/ddarji/storage/`
- Never write files outside these directories without explicit permission
