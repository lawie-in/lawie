#!/usr/bin/env bash
# T-533: production deploy helper (see docs/DEPLOY.md).
#
# Modes:
#   deploy-prod.sh remote <sha>   ON THE BOX. ECR login, `compose pull && up -d --remove-orphans`
#                                 with TAG=sha-<sha>, wait for every service to be healthy. On
#                                 failure, redeploy the previous sha-* tag (from STATE_DIR) and wait
#                                 again. Records current/previous tag in STATE_DIR on success.
#   deploy-prod.sh ssm <sha>      IN GITHUB ACTIONS. Sends ONE short line by SSM Run Command
#                                 (AWS-RunShellScript, no SSH) that runs
#                                 `<PROD_DEPLOY_DIR>/deploy.sh remote sha-<sha>` on the prod box. The
#                                 console steps put a copy of this script there as deploy.sh and
#                                 docker-compose.prod.yml next to it (docs/DEPLOY.md). Nothing else is
#                                 shipped. Waits for the command and returns its code.
#   deploy-prod.sh retag <sha>    IN GITHUB ACTIONS. Points the `main` tag of all six ECR repos at
#                                 sha-<sha>. Checks all six images exist before changing any.
#
# <sha> is a full 40-character commit SHA, with or without the `sha-` prefix.
#
# Exit codes (remote and ssm):
#   0  deployed and healthy
#   1  new tag failed; rolled back to the previous tag, which is healthy
#   2  usage or configuration error
#   3  new tag failed and rollback failed or was impossible (first deploy): the box needs a human
#   4  (ssm only) the SSM command failed before the deploy script ran, or timed out
# retag: 0 ok, 1 an image is missing or put-image failed, 2 usage.
#
# Commands are injectable for tests (no network needed):
#   AWS_CLI (default: aws), DOCKER (default: docker), DOCKER_COMPOSE (default: docker compose)
# Other settings (env):
#   remote: ECR_REGISTRY (required), AWS_REGION (default ap-south-1), COMPOSE_FILE (default
#           ./docker-compose.prod.yml), STATE_DIR (default /opt/lawie/state), SERVICES (default
#           "redis gateway auth drafting billing email-worker web"), HEALTH_TIMEOUT seconds
#           (default 300), HEALTH_INTERVAL seconds (default 5), SKIP_ECR_LOGIN=1 for local runs.
#   ssm:    ECR_REGISTRY, AWS_REGION, PROD_INSTANCE_ID or PROD_INSTANCE_TAG (EC2 Name tag),
#           PROD_DEPLOY_DIR (default /opt/lawie; holds deploy.sh, docker-compose.prod.yml and
#           state/), SSM_TIMEOUT seconds (default 1800, also the SSM executionTimeout),
#           SSM_POLL_INTERVAL seconds (default 10).
#   retag:  AWS_REGION, APP_SERVICES (default the six apps), REPO_PREFIX (default lawie-prod-).

set -euo pipefail

AWS_CLI="${AWS_CLI:-aws}"
DOCKER="${DOCKER:-docker}"
DOCKER_COMPOSE="${DOCKER_COMPOSE:-docker compose}"
AWS_REGION="${AWS_REGION:-ap-south-1}"
APP_SERVICES="${APP_SERVICES:-gateway auth drafting billing email-worker web}"
REPO_PREFIX="${REPO_PREFIX:-lawie-prod-}"

log() { printf '[deploy-prod] %s\n' "$*" >&2; }

usage() {
  echo "usage: $0 remote|ssm|retag <40-char commit sha, optional sha- prefix>" >&2
  exit 2
}

# Prints sha-<40 hex> or fails.
normalize_tag() {
  local raw="${1:-}"
  raw="${raw#sha-}"
  if [[ ! "$raw" =~ ^[0-9a-f]{40}$ ]]; then
    log "not a full 40-character lower-case commit sha: '${1:-}'"
    return 2
  fi
  printf 'sha-%s\n' "$raw"
}

# ── remote (on the box) ─────────────────────────────────────────────────────

compose() {
  # shellcheck disable=SC2086  # DOCKER_COMPOSE is a command prefix, word splitting intended
  $DOCKER_COMPOSE -f "$COMPOSE_FILE" "$@"
}

ecr_login() {
  if [[ "${SKIP_ECR_LOGIN:-}" == "1" ]]; then
    log "SKIP_ECR_LOGIN=1: not logging in to ECR"
    return 0
  fi
  # shellcheck disable=SC2086
  $AWS_CLI ecr get-login-password --region "$AWS_REGION" \
    | $DOCKER login --username AWS --password-stdin "${ECR_REGISTRY%%/*}" >/dev/null
}

# compose_up <tag>
compose_up() {
  export TAG="$1"
  log "pulling and starting $TAG"
  compose pull && compose up -d --remove-orphans
}

# Health of one service: healthy | unhealthy | starting | missing | <container state>
service_health() {
  local svc="$1" cid
  cid="$(compose ps -q "$svc" 2>/dev/null | head -n1 || true)"
  if [[ -z "$cid" ]]; then
    echo missing
    return 0
  fi
  # shellcheck disable=SC2086
  $DOCKER inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null \
    || echo missing
}

# wait_healthy: 0 when every service is healthy (or running, if it has no health check) before
# HEALTH_TIMEOUT; 1 on timeout or as soon as one service reports unhealthy.
wait_healthy() {
  local timeout="${HEALTH_TIMEOUT:-300}" interval="${HEALTH_INTERVAL:-5}"
  local deadline=$(($(date +%s) + timeout))
  local svc status pending
  while :; do
    pending=""
    for svc in $SERVICES; do
      status="$(service_health "$svc")"
      case "$status" in
        healthy | running) ;;
        unhealthy)
          log "$svc is unhealthy"
          return 1
          ;;
        *) pending="$pending $svc($status)" ;;
      esac
    done
    if [[ -z "$pending" ]]; then
      log "all services healthy: $SERVICES"
      return 0
    fi
    if (($(date +%s) >= deadline)); then
      log "health timeout after ${timeout}s, still waiting on:$pending"
      return 1
    fi
    sleep "$interval"
  done
}

record_tags() {
  local new="$1" prev="$2"
  printf '%s\n' "$new" >"$STATE_DIR/current_tag"
  if [[ -n "$prev" && "$prev" != "$new" ]]; then
    printf '%s\n' "$prev" >"$STATE_DIR/previous_tag"
  fi
}

remote_main() {
  local new_tag prev_tag=""
  new_tag="$(normalize_tag "${1:-}")" || exit 2
  if [[ -z "${ECR_REGISTRY:-}" ]]; then
    log "ECR_REGISTRY is not set"
    exit 2
  fi
  export ECR_REGISTRY AWS_REGION
  COMPOSE_FILE="${COMPOSE_FILE:-./docker-compose.prod.yml}"
  STATE_DIR="${STATE_DIR:-/opt/lawie/state}"
  SERVICES="${SERVICES:-redis gateway auth drafting billing email-worker web}"
  if [[ ! -f "$COMPOSE_FILE" ]]; then
    log "compose file not found: $COMPOSE_FILE"
    exit 2
  fi
  mkdir -p "$STATE_DIR"
  if [[ -s "$STATE_DIR/current_tag" ]]; then
    prev_tag="$(head -n1 "$STATE_DIR/current_tag")"
  fi
  log "deploying $new_tag (previous: ${prev_tag:-none})"

  if ! ecr_login; then
    log "ECR login failed; nothing was changed"
    exit 3
  fi

  if compose_up "$new_tag" && wait_healthy; then
    record_tags "$new_tag" "$prev_tag"
    log "deployed $new_tag"
    exit 0
  fi

  log "deploy of $new_tag failed; recent logs:"
  compose logs --tail 30 >&2 || true

  if [[ -z "$prev_tag" || "$prev_tag" == "$new_tag" ]]; then
    log "no previous tag to roll back to; the box needs a human"
    exit 3
  fi

  log "rolling back to $prev_tag"
  if compose_up "$prev_tag" && wait_healthy; then
    log "rolled back to $prev_tag; $new_tag is NOT deployed"
    exit 1
  fi
  log "rollback to $prev_tag also failed; the box needs a human"
  exit 3
}

# ── ssm (in Actions) ────────────────────────────────────────────────────────

ssm_main() {
  local tag deploy_dir targets line params cmd_id ssm_timeout
  tag="$(normalize_tag "${1:-}")" || exit 2
  deploy_dir="${PROD_DEPLOY_DIR:-/opt/lawie}"
  ssm_timeout="${SSM_TIMEOUT:-1800}"

  # Values go into a hand-built JSON string and a remote shell, so allow only safe characters.
  if [[ ! "$ssm_timeout" =~ ^[0-9]+$ ]]; then
    log "SSM_TIMEOUT must be a whole number of seconds"
    exit 2
  fi
  if [[ ! "${ECR_REGISTRY:-}" =~ ^[A-Za-z0-9._:/-]+$ ]]; then
    log "ECR_REGISTRY is missing or has unexpected characters"
    exit 2
  fi
  if [[ ! "$AWS_REGION" =~ ^[a-z0-9-]+$ ]]; then
    log "AWS_REGION has unexpected characters"
    exit 2
  fi
  if [[ ! "$deploy_dir" =~ ^/[A-Za-z0-9._/-]+$ ]]; then
    log "PROD_DEPLOY_DIR must be an absolute path of safe characters"
    exit 2
  fi
  if [[ -n "${PROD_INSTANCE_ID:-}" ]]; then
    [[ "$PROD_INSTANCE_ID" =~ ^i-[0-9a-f]+$ ]] || { log "PROD_INSTANCE_ID looks wrong"; exit 2; }
    targets="Key=InstanceIds,Values=$PROD_INSTANCE_ID"
  elif [[ -n "${PROD_INSTANCE_TAG:-}" ]]; then
    [[ "$PROD_INSTANCE_TAG" =~ ^[A-Za-z0-9._-]+$ ]] || { log "PROD_INSTANCE_TAG looks wrong"; exit 2; }
    targets="Key=tag:Name,Values=$PROD_INSTANCE_TAG"
  else
    log "set PROD_INSTANCE_ID or PROD_INSTANCE_TAG"
    exit 2
  fi

  # One short POSIX line (AWS-RunShellScript uses /bin/sh). deploy.sh and docker-compose.prod.yml
  # are already on the box (console steps, docs/DEPLOY.md); the real work is in bash there.
  line="cd $deploy_dir && COMPOSE_PROJECT_NAME=lawie-prod ECR_REGISTRY=$ECR_REGISTRY AWS_REGION=$AWS_REGION COMPOSE_FILE=$deploy_dir/docker-compose.prod.yml STATE_DIR=$deploy_dir/state bash $deploy_dir/deploy.sh remote $tag"
  params="{\"commands\":[\"$line\"],\"executionTimeout\":[\"$ssm_timeout\"]}"

  log "sending SSM deploy of $tag to $targets"
  # shellcheck disable=SC2086
  cmd_id="$($AWS_CLI ssm send-command --region "$AWS_REGION" \
    --document-name AWS-RunShellScript \
    --targets "$targets" \
    --max-concurrency 1 --max-errors 0 \
    --comment "lawie prod deploy $tag" \
    --parameters "$params" \
    --query 'Command.CommandId' --output text)" || { log "send-command failed"; exit 4; }
  log "SSM command id: $cmd_id"

  local deadline=$(($(date +%s) + ssm_timeout + 120))
  local status="" count=""
  while :; do
    # shellcheck disable=SC2086
    read -r status count < <($AWS_CLI ssm list-commands --region "$AWS_REGION" --command-id "$cmd_id" \
      --query 'Commands[0].[Status,TargetCount]' --output text || echo "Unknown 0")
    case "$status" in
      Success | Failed | TimedOut | Cancelled) break ;;
    esac
    if (($(date +%s) >= deadline)); then
      log "gave up waiting for SSM command $cmd_id (last status: $status)"
      exit 4
    fi
    sleep "${SSM_POLL_INTERVAL:-10}"
  done

  if [[ "$count" == "0" ]]; then
    log "SSM command matched no instance ($targets)"
    exit 4
  fi

  log "SSM output:"
  # shellcheck disable=SC2086
  $AWS_CLI ssm list-command-invocations --region "$AWS_REGION" --command-id "$cmd_id" --details \
    --query 'CommandInvocations[].CommandPlugins[].Output' --output text >&2 || true

  if [[ "$status" == "Success" ]]; then
    log "deploy of $tag succeeded"
    exit 0
  fi

  local code
  # shellcheck disable=SC2086
  code="$($AWS_CLI ssm list-command-invocations --region "$AWS_REGION" --command-id "$cmd_id" --details \
    --query 'CommandInvocations[0].CommandPlugins[0].ResponseCode' --output text 2>/dev/null || echo "")"
  case "$code" in
    1) log "deploy of $tag failed; the box rolled back to its previous tag" ; exit 1 ;;
    3) log "deploy of $tag failed and the box could not roll back" ; exit 3 ;;
    2) log "deploy script reported a usage/config error on the box" ; exit 2 ;;
    127) log "$deploy_dir/deploy.sh was not found on the box (console steps, docs/DEPLOY.md)" ; exit 4 ;;
    *) log "SSM command ended $status (response code '${code}')" ; exit 4 ;;
  esac
}

# ── retag (in Actions) ──────────────────────────────────────────────────────

retag_main() {
  local tag svc manifest err
  tag="$(normalize_tag "${1:-}")" || exit 2
  local -A manifests=()

  for svc in $APP_SERVICES; do
    # shellcheck disable=SC2086
    manifest="$($AWS_CLI ecr batch-get-image --region "$AWS_REGION" \
      --repository-name "${REPO_PREFIX}${svc}" --image-ids "imageTag=$tag" \
      --query 'images[0].imageManifest' --output text 2>/dev/null || true)"
    if [[ -z "$manifest" || "$manifest" == "None" ]]; then
      log "image ${REPO_PREFIX}${svc}:$tag not found in ECR (lifecycle keeps the last 5 tags); nothing retagged"
      exit 1
    fi
    manifests[$svc]="$manifest"
  done

  for svc in $APP_SERVICES; do
    # shellcheck disable=SC2086
    if ! err="$($AWS_CLI ecr put-image --region "$AWS_REGION" \
      --repository-name "${REPO_PREFIX}${svc}" --image-tag main \
      --image-manifest "${manifests[$svc]}" 2>&1 >/dev/null)"; then
      if grep -q ImageAlreadyExistsException <<<"$err"; then
        log "${REPO_PREFIX}${svc}:main already points at $tag"
        continue
      fi
      log "put-image failed for ${REPO_PREFIX}${svc}: $err"
      exit 1
    fi
    log "${REPO_PREFIX}${svc}:main -> $tag"
  done
}

main() {
  [[ $# -eq 2 ]] || usage
  case "$1" in
    remote) remote_main "$2" ;;
    ssm) ssm_main "$2" ;;
    retag) retag_main "$2" ;;
    *) usage ;;
  esac
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
