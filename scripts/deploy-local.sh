#!/usr/bin/env bash
# T-606: box-local deploy. Run ON the box (prod or develop), never from a laptop.
# Nothing is copied off or onto the box: the env file already lives on the box at the
# path named on line 1 of ecosystem.config.js.
#
#   usage: scripts/deploy-local.sh <main|develop>
#
# Steps: branch guard (IMDSv2 instance id) -> not-root and tool checks -> clean-checkout
# check -> fetch, checkout, pull --ff-only -> load env -> install -> build -> web
# standalone assets -> pm2 reload -> T-442 health gate. Any failure exits non-zero.
#
# The whole body is in main(), called on the last line, so bash has read the entire file
# before anything runs: a `git pull` that rewrites this file cannot change the running
# deploy.
set -euo pipefail

# Instance ids (not secrets). The guard refuses anything it does not recognise.
PROD_INSTANCE_ID="i-0e11d3dd5716776ff"
DEVELOP_INSTANCE_ID="i-07925b68d6dd907c4"

# The one tracked file `next build` rewrites on every build. It is restored before the
# clean-checkout check, or every second deploy would be refused as dirty.
NEXT_ENV_DTS="apps/web/next-env.d.ts"

usage() {
  echo "usage: $0 <main|develop>" >&2
  echo "  main    - prod box only" >&2
  echo "  develop - develop box only" >&2
}

fail() {
  echo "  x DEPLOY REFUSED: $*" >&2
  exit 1
}

# Prints `export NAME='value'` lines for every variable in the env file, to be eval'd.
# Parsing is Node's own (`--env-file`, dotenv semantics, the same way pm2 reads the
# file), so unquoted values with spaces work and nothing in a value is ever executed.
# util.parseEnv (same parser) supplies the file's variable names; values come from the
# process env that --env-file populated. Every value is single-quoted with each ' written
# as '\'' so $, backticks, quotes, spaces and newlines stay literal through eval.
# Exits 3 on any problem. Output is never printed by the caller.
ENV_LOADER_JS='
const fs = require("fs");
const util = require("util");
const file = process.argv[1];
if (typeof util.parseEnv !== "function") {
  process.stderr.write("node has no util.parseEnv (needs node >= 20.12)\n");
  process.exit(3);
}
const names = Object.keys(util.parseEnv(fs.readFileSync(file, "utf8")));
const q = String.fromCharCode(39);
let out = "";
for (const name of names) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    process.stderr.write("env file has a variable name that is not a valid shell name\n");
    process.exit(3);
  }
  const value = process.env[name] === undefined ? "" : process.env[name];
  out += "export " + name + "=" + q + value.split(q).join(q + "\\" + q + q) + q + "\n";
}
process.stdout.write(out);
'

main() {
  if [ "$#" -ne 1 ]; then
    usage
    exit 2
  fi
  local BRANCH="$1"
  case "$BRANCH" in
    main | develop) ;;
    *)
      usage
      exit 2
      ;;
  esac

  # -------------------------------------------------------------------------
  # Branch guard: which box is this? IMDSv2 (token, then instance-id).
  # --noproxy '*' so a proxy setting can never route the metadata request (or its
  # token) off the box.
  # -------------------------------------------------------------------------
  local IMDS_HOST IMDS_BASE IMDS_TOKEN INSTANCE_ID BOX ALLOWED_BRANCH
  # AWS IMDS link-local address, fixed by AWS, not a reassignable host
  IMDS_HOST="169.254.169.254"
  IMDS_BASE="http://${IMDS_HOST}/latest"

  echo "-> checking which box this is (IMDSv2)..."
  IMDS_TOKEN="$(curl -sS -f --noproxy '*' --max-time 3 -X PUT "${IMDS_BASE}/api/token" \
    -H "X-aws-ec2-metadata-token-ttl-seconds: 60" < /dev/null)" \
    || fail "instance metadata (IMDSv2 token) unreachable; cannot tell which box this is"
  [ -n "$IMDS_TOKEN" ] || fail "empty IMDSv2 token; cannot tell which box this is"

  INSTANCE_ID="$(curl -sS -f --noproxy '*' --max-time 3 "${IMDS_BASE}/meta-data/instance-id" \
    -H "X-aws-ec2-metadata-token: ${IMDS_TOKEN}" < /dev/null)" \
    || fail "instance metadata (instance-id) unreachable; cannot tell which box this is"
  unset IMDS_TOKEN

  case "$INSTANCE_ID" in
    "$PROD_INSTANCE_ID") BOX="prod" ; ALLOWED_BRANCH="main" ;;
    "$DEVELOP_INSTANCE_ID") BOX="develop" ; ALLOWED_BRANCH="develop" ;;
    *) fail "unknown instance id '${INSTANCE_ID}'; this script only deploys on the prod or develop box" ;;
  esac

  if [ "$BRANCH" != "$ALLOWED_BRANCH" ]; then
    fail "branch '${BRANCH}' may not be deployed on the ${BOX} box (only '${ALLOWED_BRANCH}')"
  fi
  echo "   ${BOX} box (${INSTANCE_ID}), deploying '${BRANCH}'"

  # Run as the checkout owner (ubuntu): as root, git rejects the checkout as another
  # user's and pm2 would talk to root's daemon, not the one running the apps.
  [ "$(id -u)" -ne 0 ] || fail "run as the checkout owner, not root"

  local c
  for c in git yarn pm2 node curl sed; do
    command -v "$c" > /dev/null || fail "'${c}' not on PATH (run from a login shell, e.g. sudo -u ubuntu -i, so nvm's PATH is loaded)"
  done

  # -------------------------------------------------------------------------
  # Repo: the checkout this script lives in.
  # -------------------------------------------------------------------------
  local SCRIPT_DIR REPO_DIR
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
  cd "$REPO_DIR"

  # Undo the previous build's rewrite of next-env.d.ts (that one file only).
  git checkout -q -- "$NEXT_ENV_DTS"

  # Refuse a dirty checkout (tracked changes) rather than force anything.
  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    fail "working tree in ${REPO_DIR} has uncommitted changes to tracked files; resolve by hand"
  fi

  echo "-> git fetch..."
  git fetch origin

  echo "-> git checkout ${BRANCH}..."
  git checkout "$BRANCH" --

  # Refuse a diverged branch: local must be an ancestor of (or equal to) origin's.
  if ! git merge-base --is-ancestor HEAD "origin/${BRANCH}"; then
    fail "local '${BRANCH}' has diverged from origin/${BRANCH}; resolve by hand (no reset, no push)"
  fi

  echo "-> git pull --ff-only..."
  git pull --ff-only origin "$BRANCH"

  # -------------------------------------------------------------------------
  # Env: path parsed from line 1 of ecosystem.config.js, e.g.
  #   const ENV_FILE = '<absolute path>';
  # Values are never printed.
  # -------------------------------------------------------------------------
  local ENV_FILE ENV_EXPORTS
  ENV_FILE="$(sed -n "1s/^const ENV_FILE = '\([^']*\)';[[:space:]]*\$/\1/p" ecosystem.config.js)"
  [ -n "$ENV_FILE" ] || fail "could not parse ENV_FILE from line 1 of ecosystem.config.js"
  case "$ENV_FILE" in
    /*) ;;
    *) fail "ENV_FILE on line 1 of ecosystem.config.js is not an absolute path" ;;
  esac
  if [ ! -f "$ENV_FILE" ] || [ ! -r "$ENV_FILE" ]; then
    fail "env file named in ecosystem.config.js is missing or unreadable: ${ENV_FILE}"
  fi

  echo "-> loading env from ${ENV_FILE} (values not shown)..."
  if ! ENV_EXPORTS="$(node --env-file="$ENV_FILE" -e "$ENV_LOADER_JS" "$ENV_FILE")"; then
    echo "  x DEPLOY FAILED: could not parse the env file with node --env-file" >&2
    exit 3
  fi
  eval "$ENV_EXPORTS"
  unset ENV_EXPORTS
  SENTRY_RELEASE=$(git rev-parse HEAD); export SENTRY_RELEASE

  echo "-> installing dependencies..."
  yarn install --frozen-lockfile --production=false

  echo "-> building packages..."
  yarn workspace @lawie/shared build
  yarn workspace @lawie/email-client build

  echo "-> building all services..."
  yarn workspaces run build

  echo "-> copying web public assets to standalone..."
  cp -r apps/web/public/. apps/web/.next/standalone/apps/web/public/
  cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static 2>/dev/null || true

  echo "-> reloading pm2..."
  pm2 reload ecosystem.config.js --update-env

  pm2 status

  # T-442: health gate. Every service must answer HTTP 200 after the reload, or the
  # deploy exits non-zero. Ports are the ones each service binds: all five Node services
  # read PORT (apps/<svc>/src/config/env.ts) and fall back to the defaults below, since
  # the shared env file does not set PORT; ecosystem.config.js sets PORT=3000 for
  # web only. The email worker's /health returns 503 while held (live send with an
  # unfilled footer placeholder): that fails the deploy. Web has no /health route, so
  # its check is GET / (the marketing home page) returning 200.
  echo "-> health checks..."
  local HEALTH_TRIES=10
  local HEALTH_DELAY=3
  local CHECKS="lawie-gateway|http://localhost:4000/health
lawie-auth|http://localhost:4001/health
lawie-drafting|http://localhost:4002/health
lawie-billing|http://localhost:4003/health
lawie-email-worker|http://localhost:9100/health
lawie-web|http://localhost:3000/"

  local pending="$CHECKS" still name url code
  declare -A last_code
  local try=1
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
    echo "  x DEPLOY FAILED: unhealthy after $HEALTH_TRIES tries, ${HEALTH_DELAY}s apart:"
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
  echo "-> deploy complete: ${BRANCH} @ ${SENTRY_RELEASE} on the ${BOX} box."
}

main "$@"
