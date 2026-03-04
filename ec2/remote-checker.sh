#!/bin/bash
# AI Assistant — EC2 Remote Health Checker
#
# Lightweight external check: verifies the bot is reachable from outside.
# Runs via cron every 2 minutes.
#
# Setup:
#   1. Copy this script + .env to the EC2 instance
#   2. chmod +x remote-checker.sh
#   3. crontab -e → */2 * * * * /path/to/remote-checker.sh
#
# Required .env variables (source file next to this script):
#   WEBHOOK_URL=https://your-tunnel.trycloudflare.com/webhook
#   VERIFY_TOKEN=your_random_verify_token_here
#   META_ACCESS_TOKEN=your_system_user_token_here
#   META_PHONE_NUMBER_ID=your_phone_number_id_here
#   ALERT_PHONES="16262300167 14243937267"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"
STATE_FILE="${SCRIPT_DIR}/.checker-state"
MAX_FAILURES=3

# ── Functions ──

send_alert() {
  local message="$1"
  for phone in $ALERT_PHONES; do
    curl -s -X POST \
      "https://graph.facebook.com/v21.0/${META_PHONE_NUMBER_ID}/messages" \
      -H "Authorization: Bearer ${META_ACCESS_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "{
        \"messaging_product\": \"whatsapp\",
        \"to\": \"${phone}\",
        \"type\": \"text\",
        \"text\": { \"body\": \"${message}\" }
      }" > /dev/null 2>&1 || true
  done
}

# ── Main ──

# Load config
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found" >&2
  exit 1
fi
# shellcheck source=/dev/null
source "$ENV_FILE"

# Required vars
: "${WEBHOOK_URL:?Missing WEBHOOK_URL in .env}"
: "${VERIFY_TOKEN:?Missing VERIFY_TOKEN in .env}"
: "${META_ACCESS_TOKEN:?Missing META_ACCESS_TOKEN in .env}"
: "${META_PHONE_NUMBER_ID:?Missing META_PHONE_NUMBER_ID in .env}"
: "${ALERT_PHONES:?Missing ALERT_PHONES in .env}"

# Read state
FAIL_COUNT=0
WAS_DOWN=false
if [ -f "$STATE_FILE" ]; then
  # shellcheck source=/dev/null
  source "$STATE_FILE"
fi

# Check webhook endpoint (Meta verification challenge)
CHALLENGE="healthcheck-$(date +%s)"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
  "${WEBHOOK_URL}?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=${CHALLENGE}" \
  2>/dev/null || echo "000")

if [ "$HTTP_CODE" = "200" ]; then
  # Success
  if [ "$WAS_DOWN" = "true" ]; then
    send_alert "[OK] AI Assistant is reachable again (HTTP $HTTP_CODE)"
  fi
  FAIL_COUNT=0
  WAS_DOWN=false
else
  # Failure
  FAIL_COUNT=$((FAIL_COUNT + 1))
  echo "$(date -Iseconds) Check failed: HTTP $HTTP_CODE (failure $FAIL_COUNT/$MAX_FAILURES)"

  if [ "$FAIL_COUNT" -ge "$MAX_FAILURES" ] && [ "$WAS_DOWN" = "false" ]; then
    send_alert "[ALERT] AI Assistant UNREACHABLE from EC2\n\nWebhook URL: ${WEBHOOK_URL}\nHTTP status: ${HTTP_CODE}\nConsecutive failures: ${FAIL_COUNT}\n\nCheck Cloudflare tunnel and local server."
    WAS_DOWN=true
  fi
fi

# Save state
cat > "$STATE_FILE" <<EOF
FAIL_COUNT=$FAIL_COUNT
WAS_DOWN=$WAS_DOWN
EOF
