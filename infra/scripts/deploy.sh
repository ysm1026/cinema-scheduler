#!/bin/bash
# Deploy script - runs on the VM as root via GitHub Actions SSH
# Pre-built dist is downloaded from GCS (built on GitHub Actions runner)
# This VM only runs MCP server; scraping is done locally
#
# NOTE: This script must be run as a user with sudo privileges (not cinema-scheduler).
# The workflow SSH command should NOT use "sudo -u cinema-scheduler".
set -euo pipefail

APP_DIR="/opt/cinema-scheduler"
APP_USER="cinema-scheduler"
DEPLOY_SCRIPT="${APP_DIR}/infra/scripts/deploy.sh"

# Allow git operations on app directory owned by another user
git config --global --add safe.directory ${APP_DIR}

echo "=== Deploying cinema-scheduler ==="

# Get GCS bucket from instance metadata
GCS_BUCKET=$(curl -sf "http://metadata.google.internal/computeMetadata/v1/instance/attributes/gcs-bucket" -H "Metadata-Flavor: Google")

# Fix ownership before git operations (root operations may have created root-owned files)
echo "Fixing file ownership..."
chown -R ${APP_USER}:${APP_USER} ${APP_DIR}

# Pull latest code as app user (for package.json, configs, scripts)
echo "Pulling latest code..."
sudo -u ${APP_USER} git -C ${APP_DIR} fetch origin main
sudo -u ${APP_USER} git -C ${APP_DIR} reset --hard origin/main

# Re-exec updated deploy script after git pull (bash may still read old file descriptor)
if [ "${DEPLOY_REEXEC:-}" != "1" ]; then
  echo "Re-executing updated deploy script..."
  export DEPLOY_REEXEC=1 GCS_BUCKET APP_DIR APP_USER
  exec bash "${DEPLOY_SCRIPT}"
fi

# Install dependencies as app user (no build - dist comes from GCS)
echo "Installing dependencies..."
sudo -u ${APP_USER} bash -c "cd ${APP_DIR} && pnpm install --frozen-lockfile"

# Download and extract pre-built dist from GCS
echo "Downloading pre-built artifacts from GCS..."
gsutil cp "gs://${GCS_BUCKET}/deploy.tar.gz" /tmp/deploy.tar.gz
sudo -u ${APP_USER} tar -xzf /tmp/deploy.tar.gz -C ${APP_DIR}
rm /tmp/deploy.tar.gz

# Update systemd unit
echo "Updating systemd unit..."
cp ${APP_DIR}/infra/scripts/cinema-mcp.service /etc/systemd/system/
sed -i "s|\${GCS_BUCKET}|${GCS_BUCKET}|g" /etc/systemd/system/cinema-mcp.service

# Restart MCP service
systemctl daemon-reload
systemctl restart cinema-mcp.service

# Install and configure Caddy (HTTPS reverse proxy)
echo "Fetching MCP domain from metadata..."
MCP_DOMAIN=$(curl -sf "http://metadata.google.internal/computeMetadata/v1/instance/attributes/mcp-domain" -H "Metadata-Flavor: Google" || echo "")
echo "MCP_DOMAIN=${MCP_DOMAIN}"
if [ -n "${MCP_DOMAIN}" ]; then
  if ! command -v caddy &>/dev/null; then
    echo "Installing Caddy..."
    apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -qq
    apt-get install -y -qq caddy
    systemctl enable caddy
  fi

  echo "Updating Caddy config for ${MCP_DOMAIN}..."
  cp ${APP_DIR}/infra/scripts/Caddyfile /etc/caddy/Caddyfile
  sed -i "s|\${DOMAIN}|${MCP_DOMAIN}|g" /etc/caddy/Caddyfile
  systemctl reload caddy || systemctl restart caddy
fi

echo "=== Deploy complete ==="
echo "MCP status:"
systemctl status cinema-mcp.service --no-pager || true
