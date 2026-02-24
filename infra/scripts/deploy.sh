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

# Allow git operations on app directory owned by another user
git config --global --add safe.directory ${APP_DIR}

echo "=== Deploying cinema-scheduler ==="

# Get GCS bucket from instance metadata
GCS_BUCKET=$(curl -sf "http://metadata.google.internal/computeMetadata/v1/instance/attributes/gcs-bucket" -H "Metadata-Flavor: Google")

# Pull latest code as app user (for package.json, configs, scripts)
echo "Pulling latest code..."
sudo -u ${APP_USER} git -C ${APP_DIR} fetch origin main
sudo -u ${APP_USER} git -C ${APP_DIR} reset --hard origin/main

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

echo "=== Deploy complete ==="
echo "MCP status:"
systemctl status cinema-mcp.service --no-pager || true
