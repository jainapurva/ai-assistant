#!/usr/bin/env bash
#
# Setup WhatsApp Conversational Components (commands + ice breakers)
# via Meta Graph API.
#
# Usage: ./scripts/setup-conversational-components.sh
#
# Reads META_ACCESS_TOKEN and META_PHONE_NUMBER_ID from .env
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"

# Load .env
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source <(grep -E '^(META_ACCESS_TOKEN|META_PHONE_NUMBER_ID)=' "$ENV_FILE")
fi

: "${META_ACCESS_TOKEN:?Missing META_ACCESS_TOKEN in .env}"
: "${META_PHONE_NUMBER_ID:?Missing META_PHONE_NUMBER_ID in .env}"

API_VERSION="v21.0"
ENDPOINT="https://graph.facebook.com/${API_VERSION}/${META_PHONE_NUMBER_ID}/conversational_automation"

# ── Ice Breakers (max 4, max 80 chars each) ─────────────────────────
PROMPTS=$(cat <<'JSON'
[
  "What can you help me with?",
  "Analyze an image or document for me",
  "Help me draft an email",
  "Write and run some code"
]
JSON
)

# ── Commands (max 30, name max 32 chars, description max 256 chars) ──
COMMANDS=$(cat <<'JSON'
[
  { "command_name": "help",       "command_description": "Show what I can do and all commands" },
  { "command_name": "files",      "command_description": "See and download files from your workspace" },
  { "command_name": "stop",       "command_description": "Stop the current running task" },
  { "command_name": "reset",      "command_description": "Start a fresh session" },
  { "command_name": "status",     "command_description": "Check bot status and current model" },
  { "command_name": "usage",      "command_description": "View your token usage and cost" },
  { "command_name": "gmail",      "command_description": "Connect or manage Gmail and Google Drive" },
  { "command_name": "outlook",    "command_description": "Connect or manage Outlook email" },
  { "command_name": "github",     "command_description": "Connect your GitHub repos" },
  { "command_name": "repos",      "command_description": "List connected GitHub repositories" },
  { "command_name": "repo",       "command_description": "Set active GitHub repository" },
  { "command_name": "drive",      "command_description": "List your Google Drive files" },
  { "command_name": "sandbox",    "command_description": "Check workspace status and disk usage" },
  { "command_name": "register",   "command_description": "Create your user profile" },
  { "command_name": "profile",    "command_description": "View your profile and usage stats" },
  { "command_name": "imagine",    "command_description": "Generate an image with AI" },
  { "command_name": "agents",     "command_description": "See available AI agents" },
  { "command_name": "agent",      "command_description": "Switch to a different agent" },
  { "command_name": "schedule",   "command_description": "Schedule a recurring task" },
  { "command_name": "schedules",  "command_description": "List your scheduled tasks" },
  { "command_name": "unschedule", "command_description": "Remove a scheduled task" }
]
JSON
)

# Build the JSON payload
PAYLOAD=$(jq -n \
  --argjson commands "$COMMANDS" \
  --argjson prompts "$PROMPTS" \
  '{
    enable_welcome_message: true,
    commands: $commands,
    prompts: $prompts
  }')

echo "Setting up conversational components for phone number ${META_PHONE_NUMBER_ID}..."
echo ""
echo "Ice breakers: $(echo "$PROMPTS" | jq -r 'length') configured"
echo "Commands: $(echo "$COMMANDS" | jq -r 'length') configured"
echo "Welcome message: enabled"
echo ""

# Make the API call
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$ENDPOINT" \
  -H "Authorization: Bearer ${META_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [[ "$HTTP_CODE" -ge 200 && "$HTTP_CODE" -lt 300 ]]; then
  echo "Success! (HTTP $HTTP_CODE)"
  echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
else
  echo "Failed! (HTTP $HTTP_CODE)"
  echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
  exit 1
fi
