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
  SENTRY_RELEASE=$(git rev-parse HEAD); export SENTRY_RELEASE

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

  pm2 status

  # T-442: health gate. Every service must answer HTTP 200 after the reload, or the
  # deploy exits non-zero. Ports are the ones each service binds: all five Node services
  # read PORT (apps/<svc>/src/config/env.ts) and fall back to the defaults below, since
  # the shared .env.production does not set PORT; ecosystem.config.js sets PORT=3000 for
  # web only. The email worker's /health returns 503 while held (live send with an
  # unfilled footer placeholder): that fails the deploy. Web has no /health route, so
  # its check is GET / (the marketing home page) returning 200.
  echo "  health checks..."
  HEALTH_TRIES=10
  HEALTH_DELAY=3
  CHECKS="lawie-gateway|http://localhost:4000/health
lawie-auth|http://localhost:4001/health
lawie-drafting|http://localhost:4002/health
lawie-billing|http://localhost:4003/health
lawie-email-worker|http://localhost:9100/health
lawie-web|http://localhost:3000/"

  pending="$CHECKS"
  declare -A last_code
  try=1
  while [ -n "$pending" ] && [ "$try" -le "$HEALTH_TRIES" ]; do
    still=""
    while IFS='|' read -r name url; do
      [ -z "$name" ] && continue
      # No -f: a 503 must still print its code. '|| true' keeps set -e from
      # aborting before the summary; curl prints 000 when it cannot connect.
      code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$url" < /dev/null) || true
      last_code[$name]="${code:-000}"
      if [ "$code" = "200" ]; then
        echo "    ok   $name ($url) -> 200 (try $try)"
      else
        still="${still}${name}|${url}
"
      fi
    done <<< "$pending"
    pending="$still"
    if [ -n "$pending" ] && [ "$try" -lt "$HEALTH_TRIES" ]; then
      sleep "$HEALTH_DELAY"
    fi
    try=$((try + 1))
  done

  if [ -n "$pending" ]; then
    echo ""
    echo "  ✗ DEPLOY FAILED: unhealthy after $HEALTH_TRIES tries, ${HEALTH_DELAY}s apart:"
    while IFS='|' read -r name url; do
      [ -z "$name" ] && continue
      echo "    FAIL $name ($url) -> HTTP ${last_code[$name]}"
      if [ "$name" = "lawie-email-worker" ] && [ "${last_code[$name]}" = "503" ]; then
        echo "         email worker is held (live send with an unfilled footer placeholder)"
      fi
    done <<< "$pending"
    echo "  check: pm2 logs <name> --lines 100"
    exit 1
  fi

  echo "  all six services healthy."
ENDSSH

echo "✓ Deploy complete."
