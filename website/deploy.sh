#!/bin/bash

###############################################################################
# AWS Deployment Script for Read With Me (readwithme.ai)
# Builds locally, deploys standalone Next.js app to EC2
# Domain: readwithme.ai  |  Port: 3003
###############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
AWS_HOST="3.238.88.157"
AWS_USER="ubuntu"
SSH_KEY="/media/ddarji/storage/git/free_uploader/socialAI.pem"
REMOTE_DIR="/opt/readwithme"
SERVICE_NAME="readwithme"
DOMAIN="readwithme.ai"
PORT=3003

cd "$(dirname "$0")"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Read With Me - Deploy to AWS EC2${NC}"
echo -e "${CYAN}  Domain: ${DOMAIN}  |  Port: ${PORT}${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ============================================================================
# STEP 1: Validate prerequisites
# ============================================================================
echo -e "${YELLOW}Step 1: Validating prerequisites...${NC}"

if [ ! -f "$SSH_KEY" ]; then
    echo -e "${RED}SSH key not found: $SSH_KEY${NC}"
    exit 1
fi
chmod 400 "$SSH_KEY"
echo -e "${GREEN}  SSH key found${NC}"

if ! command -v node &> /dev/null; then
    echo -e "${RED}Node.js not found${NC}"
    exit 1
fi
echo -e "${GREEN}  Node.js $(node --version)${NC}"
echo ""

# ============================================================================
# STEP 2: Build locally
# ============================================================================
echo -e "${YELLOW}Step 2: Building Next.js app locally...${NC}"

rm -rf .next/

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 20 2>/dev/null || true

npm run build

if [ ! -d ".next/standalone" ] || [ ! -f ".next/standalone/server.js" ]; then
    echo -e "${RED}Build failed - standalone output not found${NC}"
    exit 1
fi

BUILD_ID=$(cat .next/BUILD_ID)
echo -e "${GREEN}  Build complete (ID: $BUILD_ID)${NC}"
echo ""

# ============================================================================
# STEP 3: Test SSH connection
# ============================================================================
echo -e "${YELLOW}Step 3: Testing SSH connection...${NC}"

if ssh -i "$SSH_KEY" -o ConnectTimeout=15 -o StrictHostKeyChecking=no "$AWS_USER@$AWS_HOST" "echo 'ok'" > /dev/null 2>&1; then
    echo -e "${GREEN}  SSH connection successful${NC}"
else
    echo -e "${RED}SSH connection failed to $AWS_HOST${NC}"
    exit 1
fi
echo ""

# ============================================================================
# STEP 4: Prepare server directory
# ============================================================================
echo -e "${YELLOW}Step 4: Preparing server directory...${NC}"

ssh -i "$SSH_KEY" "$AWS_USER@$AWS_HOST" << ENDSSH
    sudo mkdir -p ${REMOTE_DIR}
    sudo chown -R ${AWS_USER}:${AWS_USER} ${REMOTE_DIR}
ENDSSH

echo -e "${GREEN}  Server directory ready${NC}"
echo ""

# ============================================================================
# STEP 5: Rsync build artifacts to server
# ============================================================================
echo -e "${YELLOW}Step 5: Uploading build artifacts...${NC}"

echo "  Syncing .next/standalone/..."
rsync -az --delete \
    --exclude='.env' \
    -e "ssh -i $SSH_KEY" \
    .next/standalone/ "$AWS_USER@$AWS_HOST:$REMOTE_DIR/" || {
    RC=$?
    if [ $RC -eq 23 ]; then
        echo -e "${YELLOW}  Rsync partial transfer (code 23) - continuing${NC}"
    else
        exit $RC
    fi
}

echo "  Syncing .next/static/..."
rsync -az \
    -e "ssh -i $SSH_KEY" \
    .next/static/ "$AWS_USER@$AWS_HOST:$REMOTE_DIR/.next/static/"

echo "  Syncing public/..."
rsync -az \
    -e "ssh -i $SSH_KEY" \
    public/ "$AWS_USER@$AWS_HOST:$REMOTE_DIR/public/"

echo -e "${GREEN}  Upload complete${NC}"
echo ""

# ============================================================================
# STEP 6: Create systemd service
# ============================================================================
echo -e "${YELLOW}Step 6: Configuring systemd service...${NC}"

ssh -i "$SSH_KEY" "$AWS_USER@$AWS_HOST" << 'ENDSSH'
sudo tee /etc/systemd/system/readwithme.service > /dev/null <<'SERVICE_EOF'
[Unit]
Description=Read With Me - Landing Page (Next.js)
After=network.target

[Service]
Type=simple
User=ubuntu
Group=ubuntu
WorkingDirectory=/opt/readwithme
EnvironmentFile=/opt/readwithme/.env
Environment="NODE_ENV=production"
Environment="PORT=3003"
Environment="HOSTNAME=0.0.0.0"
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SERVICE_EOF

sudo systemctl daemon-reload
sudo systemctl enable readwithme
ENDSSH

echo -e "${GREEN}  Service configured${NC}"
echo ""

# ============================================================================
# STEP 7: Create nginx config
# ============================================================================
echo -e "${YELLOW}Step 7: Configuring nginx...${NC}"

ssh -i "$SSH_KEY" "$AWS_USER@$AWS_HOST" << 'ENDSSH'
if [ ! -f /etc/nginx/sites-available/readwithme.ai ]; then
    sudo tee /etc/nginx/sites-available/readwithme.ai > /dev/null <<'NGINX_EOF'
server {
    listen 80;
    server_name readwithme.ai www.readwithme.ai;

    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:3003;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINX_EOF

    sudo ln -sf /etc/nginx/sites-available/readwithme.ai /etc/nginx/sites-enabled/
    echo "Nginx config created"
else
    echo "Nginx config already exists (preserving certbot changes)"
fi

sudo nginx -t && sudo systemctl reload nginx
ENDSSH

echo -e "${GREEN}  Nginx configured${NC}"
echo ""

# ============================================================================
# STEP 8: SSL certificate (certbot)
# ============================================================================
echo -e "${YELLOW}Step 8: Checking SSL certificate...${NC}"

ssh -i "$SSH_KEY" "$AWS_USER@$AWS_HOST" << 'ENDSSH'
if sudo certbot certificates 2>/dev/null | grep -q "readwithme.ai"; then
    echo "SSL certificate already exists"
else
    echo "Requesting SSL certificate..."
    sudo certbot --nginx -d readwithme.ai -d www.readwithme.ai --non-interactive --agree-tos --email dhruvil.darji@gmail.com || {
        echo "WARNING: Certbot failed. Make sure DNS A records point to this server."
        echo "You can run certbot manually later:"
        echo "  sudo certbot --nginx -d readwithme.ai -d www.readwithme.ai"
    }
fi
ENDSSH

echo -e "${GREEN}  SSL check complete${NC}"
echo ""

# ============================================================================
# STEP 9: Create .env if missing
# ============================================================================
echo -e "${YELLOW}Step 9: Checking .env file...${NC}"

ssh -i "$SSH_KEY" "$AWS_USER@$AWS_HOST" << 'ENDSSH'
if [ ! -f /opt/readwithme/.env ]; then
    tee /opt/readwithme/.env > /dev/null <<'ENV_EOF'
# AWS DynamoDB (fill in with real credentials)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=

# DynamoDB table names
DYNAMODB_USERS_TABLE=rwm-users
DYNAMODB_PROMO_TABLE=rwm-promo-codes

# WhatsApp bot phone number (digits only)
BOT_PHONE_NUMBER=15551234567
ENV_EOF
    echo ".env template created — EDIT /opt/readwithme/.env with real values"
else
    echo ".env already exists"
fi
ENDSSH

echo -e "${GREEN}  .env check complete${NC}"
echo ""

# ============================================================================
# STEP 10: Start/restart service
# ============================================================================
echo -e "${YELLOW}Step 10: Starting service...${NC}"

ssh -i "$SSH_KEY" "$AWS_USER@$AWS_HOST" << 'ENDSSH'
sudo systemctl restart readwithme
sleep 3
echo "Service status:"
sudo systemctl is-active readwithme
ENDSSH

echo -e "${GREEN}  Service started${NC}"
echo ""

# ============================================================================
# STEP 11: Verify deployment
# ============================================================================
echo -e "${YELLOW}Step 11: Verifying deployment...${NC}"

VERIFY_FAILED=0

if ssh -i "$SSH_KEY" "$AWS_USER@$AWS_HOST" "sudo systemctl is-active --quiet readwithme"; then
    echo -e "${GREEN}  readwithme service: active${NC}"
else
    echo -e "${RED}  readwithme service: FAILED${NC}"
    ssh -i "$SSH_KEY" "$AWS_USER@$AWS_HOST" "sudo journalctl -u readwithme -n 15 --no-pager"
    VERIFY_FAILED=1
fi

PORT_CHECK=$(ssh -i "$SSH_KEY" "$AWS_USER@$AWS_HOST" "sudo ss -tlnp | grep ':3003' || echo 'NOT_LISTENING'")
if [[ "$PORT_CHECK" != *"NOT_LISTENING"* ]]; then
    echo -e "${GREEN}  Port 3003: listening${NC}"
else
    echo -e "${RED}  Port 3003: NOT listening${NC}"
    VERIFY_FAILED=1
fi

# Verify other services still running
for svc in 3dprints-shop free-uploader; do
    if ssh -i "$SSH_KEY" "$AWS_USER@$AWS_HOST" "sudo systemctl is-active --quiet $svc 2>/dev/null"; then
        echo -e "${GREEN}  $svc: still running${NC}"
    else
        echo -e "${YELLOW}  $svc: not detected${NC}"
    fi
done

echo ""

# ============================================================================
# Summary
# ============================================================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
if [ $VERIFY_FAILED -eq 0 ]; then
    echo -e "${GREEN}  Deployment Successful!${NC}"
else
    echo -e "${YELLOW}  Deployment completed with warnings${NC}"
fi
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "URLs:"
echo "   https://readwithme.ai"
echo ""
echo "Server commands:"
echo "   Status:   ssh -i $SSH_KEY $AWS_USER@$AWS_HOST 'sudo systemctl status readwithme'"
echo "   Logs:     ssh -i $SSH_KEY $AWS_USER@$AWS_HOST 'sudo journalctl -u readwithme -f'"
echo "   Restart:  ssh -i $SSH_KEY $AWS_USER@$AWS_HOST 'sudo systemctl restart readwithme'"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
