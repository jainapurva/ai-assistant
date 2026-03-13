#!/bin/bash
set -euo pipefail

# AI Assistant — systemd service installer
# Run as: sudo bash systemd/install.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SYSTEMD_DIR="/etc/systemd/system"
LOG_DIR="/media/ddarji/storage/ai-assistant"

echo "=== AI Assistant systemd installer ==="

# Create log directory
mkdir -p "$LOG_DIR"
chown ddarji:ddarji "$LOG_DIR"
echo "[OK] Log directory: $LOG_DIR"

# Copy service files
cp "$SCRIPT_DIR/ai-assistant-bot.service" "$SYSTEMD_DIR/"
echo "[OK] Service file copied to $SYSTEMD_DIR"

# Reload systemd
systemctl daemon-reload
echo "[OK] systemd daemon reloaded"

# Enable service (start on boot)
systemctl enable ai-assistant-bot.service
echo "[OK] Service enabled"

# Stop any existing instance
systemctl stop ai-assistant-bot.service 2>/dev/null || true

# Start service
systemctl start ai-assistant-bot.service
echo "[OK] Bot service started"

echo ""
echo "=== Status ==="
systemctl status ai-assistant-bot.service --no-pager -l || true

echo ""
echo "=== Commands ==="
echo "  View bot logs:      journalctl -u ai-assistant-bot -f"
echo "  Restart bot:        sudo systemctl restart ai-assistant-bot"
echo "  Stop bot:           sudo systemctl stop ai-assistant-bot"
echo "  Uninstall:          sudo systemctl disable ai-assistant-bot && sudo rm $SYSTEMD_DIR/ai-assistant-bot.service && sudo systemctl daemon-reload"
