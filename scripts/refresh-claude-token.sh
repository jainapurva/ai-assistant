#!/bin/bash
# Auto-refresh Claude OAuth token before it expires
# Runs via cron every 4 hours

CREDS_FILE="$HOME/.claude/.credentials.json"
LOG_FILE="/media/ddarji/storage/ai-assistant/logs/token-refresh.log"
CLIENT_ID="9d1c250a-e61b-44d9-88ed-5944d1962f5e"
TOKEN_URL="https://platform.claude.com/v1/oauth/token"
SCOPES="user:profile user:inference user:sessions:claude_code user:mcp_servers"
TMPFILE="/tmp/claude-token-refresh-$$.json"

log() {
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $1" >> "$LOG_FILE"
}

cleanup() {
    rm -f "$TMPFILE"
}
trap cleanup EXIT

mkdir -p "$(dirname "$LOG_FILE")"

if [ ! -f "$CREDS_FILE" ]; then
    log "ERROR: Credentials file not found: $CREDS_FILE"
    exit 1
fi

REFRESH_TOKEN=$(python3 -c "import json; print(json.load(open('$CREDS_FILE'))['claudeAiOauth']['refreshToken'])" 2>/dev/null)
EXPIRES_AT=$(python3 -c "import json; print(json.load(open('$CREDS_FILE'))['claudeAiOauth']['expiresAt'])" 2>/dev/null)

if [ -z "$REFRESH_TOKEN" ]; then
    log "ERROR: No refresh token found in credentials"
    exit 1
fi

# Check if token expires within 2 hours (7200000 ms)
NOW_MS=$(date +%s%3N)
REMAINING_MS=$((EXPIRES_AT - NOW_MS))
REMAINING_HOURS=$(( REMAINING_MS / 3600000 ))

if [ "$REMAINING_MS" -gt 7200000 ]; then
    log "Token still valid for ${REMAINING_HOURS}h, skipping refresh"
    exit 0
fi

log "Token expires in ${REMAINING_HOURS}h, refreshing..."

# Call refresh endpoint, write response to temp file to avoid bash quoting issues
HTTP_CODE=$(curl -s -w "%{http_code}" -o "$TMPFILE" -X POST "$TOKEN_URL" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=refresh_token&refresh_token=$REFRESH_TOKEN&client_id=$CLIENT_ID&scope=$SCOPES" 2>&1)

if [ "$HTTP_CODE" != "200" ]; then
    log "ERROR: Refresh failed with HTTP $HTTP_CODE: $(cat "$TMPFILE")"
    exit 1
fi

# Update credentials file from temp file response
RESULT=$(python3 -c "
import json, time
from datetime import datetime

with open('$TMPFILE', 'r') as f:
    response = json.load(f)

if 'access_token' not in response:
    print('ERROR: No access_token in response')
    exit(1)

with open('$CREDS_FILE', 'r') as f:
    creds = json.load(f)

oauth = creds['claudeAiOauth']
oauth['accessToken'] = response['access_token']
oauth['refreshToken'] = response['refresh_token']
oauth['expiresAt'] = int(time.time() * 1000) + (response['expires_in'] * 1000)

if 'scope' in response:
    oauth['scopes'] = response['scope'].split(' ')

with open('$CREDS_FILE', 'w') as f:
    json.dump(creds, f)

exp = datetime.fromtimestamp(oauth['expiresAt'] / 1000)
print(f'New expiry: {exp}')
" 2>&1)

if [ $? -eq 0 ]; then
    log "SUCCESS: Token refreshed. $RESULT"
else
    log "ERROR: Failed to update credentials: $RESULT"
    exit 1
fi
