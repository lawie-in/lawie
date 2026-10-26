#!/usr/bin/env bash
# Lawie — delete every remote branch except main, develop, develop_staging.
# Run from YOUR clone (the cloud session's git credential cannot delete remote refs: 403).
#   bash handoff/ops/prune-branches.sh            # dry run: prints what would go
#   bash handoff/ops/prune-branches.sh --apply    # deletes
# KEEP list = branches with unmerged work the leads still need (Arjun, 25 Oct 2026).
set -euo pipefail
KEEP='^(main|develop|develop_staging|feature/t-577-paragraph-stepper-web|feature/t-533-prod-pipeline|fix/t-524-dashboard-polish|fix/t-500-bail-draft-grounds-and-garbled|feature/t-488-cheque-date-state)$'
git fetch --prune origin
mapfile -t ALL < <(git branch -r | grep -v HEAD | sed 's|^ *origin/||' | grep -vE "$KEEP")
echo "${#ALL[@]} branches to delete; keeping: $(git branch -r | grep -v HEAD | sed 's|^ *origin/||' | grep -E "$KEEP" | tr '\n' ' ')"
if [[ "${1:-}" != "--apply" ]]; then printf '%s\n' "${ALL[@]}"; echo; echo "dry run — add --apply to delete"; exit 0; fi
# delete in chunks of 50 (one push each)
for ((i=0; i<${#ALL[@]}; i+=50)); do git push origin --delete "${ALL[@]:i:50}"; done
git fetch --prune origin
echo "remaining: $(git branch -r | grep -v HEAD | sed 's|^ *origin/||' | tr '\n' ' ')"
