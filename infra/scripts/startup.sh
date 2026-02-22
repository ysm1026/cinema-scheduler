#!/bin/bash
# GCE e2-micro startup script for cinema-scheduler (MCP server only)
# Runs on first boot to install dependencies and configure services
# Scraping is done locally on Windows, not on this VM
set -euo pipefail

MARKER="/opt/.cinema-scheduler-initialized"
APP_DIR="/opt/cinema-scheduler"
APP_USER="cinema-scheduler"
SWAP_SIZE="2G"

# Skip if already initialized
if [ -f "$MARKER" ]; then
  echo "Already initialized. Skipping."
  exit 0
fi

echo "=== Cinema Scheduler VM Setup (MCP only) ==="

# --- Swap ---
echo "Creating ${SWAP_SIZE} swap file..."
fallocate -l ${SWAP_SIZE} /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# --- System packages ---
echo "Installing system packages..."
apt-get update -qq
apt-get install -y -qq git curl

# --- Node.js 20 ---
echo "Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y -qq nodejs

# --- pnpm ---
echo "Installing pnpm..."
corepack enable
corepack prepare pnpm@9 --activate

# --- Application user ---
echo "Creating application user..."
useradd --system --create-home --shell /bin/bash ${APP_USER}

# --- Clone repository ---
echo "Cloning repository..."
git clone https://github.com/ysm1026/cinema-scheduler.git ${APP_DIR}
chown -R ${APP_USER}:${APP_USER} ${APP_DIR}

# --- Install dependencies (no build - dist comes from GCS via deploy) ---
echo "Installing dependencies..."
cd ${APP_DIR}
sudo -u ${APP_USER} pnpm install --frozen-lockfile

# --- Install systemd unit ---
echo "Installing systemd service..."
cp ${APP_DIR}/infra/scripts/cinema-mcp.service /etc/systemd/system/

# Replace environment placeholders from instance metadata
GCS_BUCKET=$(curl -sf "http://metadata.google.internal/computeMetadata/v1/instance/attributes/gcs-bucket" -H "Metadata-Flavor: Google" || echo "")

sed -i "s|\${GCS_BUCKET}|${GCS_BUCKET}|g" /etc/systemd/system/cinema-mcp.service

# Enable and start MCP service
systemctl daemon-reload
systemctl enable cinema-mcp.service
systemctl start cinema-mcp.service

# Mark as initialized
touch ${MARKER}

echo "=== Setup complete ==="
