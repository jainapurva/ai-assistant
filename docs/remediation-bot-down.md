# AI Assistant — Remediation: Bot Down

## Symptoms
- Users get no responses or error messages from the WhatsApp bot
- Logs show `401 authentication_error: Invalid authentication credentials`

## Root Cause
The Claude CLI OAuth token (`~/.claude/.credentials.json`) has expired or been refreshed on the host, but the sandbox containers still have a stale copy. Additionally, orphaned node processes from previous runs may be consuming resources or conflicting.

## Diagnosis Steps

### 1. Check service status
```bash
systemctl --user status ai-assistant
```

### 2. Check logs for auth errors
```bash
journalctl --user -u ai-assistant --since "1 hour ago" | grep -i "error\|401\|auth"
```

### 3. Check for orphaned processes
```bash
ps aux | grep -E "node.*src/index" | grep -v grep
```
There should be exactly **one** process matching the systemd service PID. Any extras are orphans.

### 4. Compare host vs sandbox credentials
```bash
# Host credentials (source of truth)
python3 -c "import json; d=json.load(open('/media/ddarji/storage/.claude/.credentials.json')); print('Host token ends:', d['claudeAiOauth']['accessToken'][-8:])"

# Sandbox credentials (per sandbox)
python3 -c "import json; d=json.load(open('/media/ddarji/storage/ai-assistant/sandboxes/<HASH>/.claude/.credentials.json')); print('Sandbox token ends:', d['claudeAiOauth']['accessToken'][-8:])"
```
If they don't match, the sandbox has stale credentials.

### 5. Check token expiry
```bash
python3 -c "
import json, time
d = json.load(open('/media/ddarji/storage/.claude/.credentials.json'))
exp = d['claudeAiOauth']['expiresAt'] / 1000
print(f'Expires: {time.ctime(exp)}')
print(f'Expired: {time.time() > exp}')
print(f'Hours left: {(exp - time.time()) / 3600:.1f}')
"
```

## Fix Steps

### 1. Refresh host credentials (if expired)
Run Claude CLI interactively on the host to trigger OAuth token refresh:
```bash
claude --version   # or any simple command that triggers auth
```
If it prompts for login, run `/login` and authenticate.

### 2. Copy fresh credentials to all sandboxes
```bash
for dir in /media/ddarji/storage/ai-assistant/sandboxes/*/; do
  cp /media/ddarji/storage/.claude/.credentials.json "$dir/.claude/.credentials.json"
  echo "Updated: $dir"
done
```

### 3. Kill orphaned processes
```bash
# Find the systemd-managed PID
systemctl --user show ai-assistant -p MainPID

# Kill any OTHER node src/index.js processes
ps aux | grep -E "node.*src/index" | grep -v grep | awk '{print $2}' | grep -v <MAIN_PID> | xargs kill
```

### 4. Restart the service
```bash
systemctl --user restart ai-assistant
```

### 5. Verify
```bash
# Check service is running
systemctl --user status ai-assistant

# Health check
curl -s http://localhost:5153/health

# Confirm single process
ps aux | grep -E "node.*src/index" | grep -v grep | wc -l
# Should output: 1
```

## Prevention
- The bot code (`src/sandbox.js:207-210`) copies credentials before each Claude spawn, but this only works if the host file is up-to-date
- OAuth tokens auto-refresh when the Claude CLI is used on the host, but the bot's sandboxed Claude processes cannot refresh tokens themselves
- Consider a cron job to periodically check token expiry and trigger a refresh before it expires
