#!/bin/bash
set -e

SERVER="ubuntu@13.202.145.184"
REMOTE_PATH="/home/ubuntu/lawie"

echo "→ Copying .env.production to server..."
scp .env.production "$SERVER:$REMOTE_PATH/.env.production"

echo "→ Deploying on server..."
ssh "$SERVER" bash -s << 'ENDSSH'
  set -e
  cd /home/ubuntu/lawie

  echo "  git pull..."
  git pull origin main

  echo "  loading env..."
  set -a && source .env.production && set +a

  echo "  installing dependencies..."
  yarn install --frozen-lockfile

  echo "  building packages..."
  yarn workspace @lawie/shared build
  yarn workspace @lawie/email-client build

  echo "  building all services..."
  yarn workspaces run build

  echo "  copying web public assets to standalone..."
  cp -r apps/web/public/. apps/web/.next/standalone/apps/web/public/
  cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static 2>/dev/null || true

  echo "  reloading pm2..."
  pm2 reload ecosystem.config.js --update-env

  echo "  done."
  pm2 status
ENDSSH

echo "✓ Deploy complete."
