#!/bin/bash
# Deploy script - runs on the VM via GitHub Actions SSH
# Pre-built dist is downloaded from GCS (built on GitHub Actions runner)
# This VM only runs MCP server; scraping is done locally
set -euo pipefail

APP_DIR="/opt/cinema-scheduler"
cd ${APP_DIR}

echo "=== Deploying cinema-scheduler ==="

# Get GCS bucket from instance metadata
GCS_BUCKET=$(curl -sf "http://metadata.google.internal/computeMetadata/v1/instance/attributes/gcs-bucket" -H "Metadata-Flavor: Google")

# Pull latest code (for package.json, configs, scripts)
echo "Pulling latest code..."
git fetch origin main
git reset --hard origin/main

# Install dependencies (no build - dist comes from GCS)
echo "Installing dependencies..."
pnpm install --frozen-lockfile

# Download and extract pre-built dist from GCS
echo "Downloading pre-built artifacts from GCS..."
gsutil cp "gs://${GCS_BUCKET}/deploy.tar.gz" /tmp/deploy.tar.gz
tar -xzf /tmp/deploy.tar.gz -C ${APP_DIR}
rm /tmp/deploy.tar.gz

# Update systemd unit
echo "Updating systemd unit..."
sudo cp ${APP_DIR}/infra/scripts/cinema-mcp.service /etc/systemd/system/
sudo sed -i "s|\${GCS_BUCKET}|${GCS_BUCKET}|g" /etc/systemd/system/cinema-mcp.service

# Restart MCP service
sudo systemctl daemon-reload
sudo systemctl restart cinema-mcp.service

echo "=== Deploy complete ==="
echo "MCP status:"
sudo systemctl status cinema-mcp.service --no-pager || true
