# AI Assistant — Dev Operations

## Restart the Bot

The bot runs as a background Node process from this directory.

```bash
# Find the running process
fuser 3000/tcp 2>/dev/null

# Kill it and restart
kill $(fuser 3000/tcp 2>/dev/null) && sleep 2 && cd /home/ddarji/dhruvil/storage/git/ai-assistant && node src/index.js 2>&1 & disown
```

One-liner:
```bash
kill $(fuser 3000/tcp 2>/dev/null); sleep 2; cd /home/ddarji/dhruvil/storage/git/ai-assistant && node src/index.js 2>&1 & disown
```

Verify it's running:
```bash
sleep 3 && fuser 3000/tcp 2>/dev/null && echo "Bot is running"
```

## Build Sandbox Image (required for Docker sandbox)

```bash
cd /home/ddarji/dhruvil/storage/git/ai-assistant
docker build -t ai-assistant-sandbox:latest -f Dockerfile.sandbox .
```

## Ports

| Port | Service |
|------|---------|
| 3000 | Webhook (Meta Cloud API) |
| 5153 | Internal HTTP API |

## Logs

The bot logs to stdout. To capture logs:
```bash
kill $(fuser 3000/tcp 2>/dev/null); sleep 2; cd /home/ddarji/dhruvil/storage/git/ai-assistant && node src/index.js >> /media/ddarji/storage/ai-assistant/bot.log 2>&1 & disown
```

## Run Tests

```bash
cd /home/ddarji/dhruvil/storage/git/ai-assistant && npm test
```
