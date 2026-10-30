# Arjun's production access — narrow SSM Run Command, no shell (26 Oct 2026)

Founder decision: give Arjun's cloud session a way to operate the prod box without a shell, without admin, without keys in chat.

Shape: one IAM user `lawie-arjun-ops` → may call `ssm:SendCommand` only on instance `i-0e11d3dd5716776ff` and only with the custom document `lawie-prod-ops`, whose parameters allow-list the commands. No `StartSession`, no S3, no IAM, no console. Key pair goes into the Claude cloud environment settings as `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION=ap-south-1`; rotate every 30 days; delete when T-533's pipeline removes the need.

## SSM document `lawie-prod-ops` (Command document, schema 2.2, JSON)

```json
{
  "schemaVersion": "2.2",
  "description": "Lawie prod: allow-listed ops for Arjun's session. No free-form shell.",
  "parameters": {
    "action": {
      "type": "String",
      "allowedValues": ["status", "logs", "health", "restart", "deploy", "nginx-test", "disk"]
    },
    "service": {
      "type": "String",
      "default": "all",
      "allowedPattern": "^(all|lawie-(gateway|auth|drafting|billing|email-worker|web))$"
    },
    "lines": { "type": "String", "default": "100", "allowedPattern": "^[0-9]{1,3}$" }
  },
  "mainSteps": [
    {
      "action": "aws:runShellScript",
      "name": "run",
      "inputs": {
        "timeoutSeconds": "900",
        "runCommand": [
          "set -u",
          "A='{{ action }}'; S='{{ service }}'; N='{{ lines }}'",
          "run_u() { sudo -u ubuntu -i bash -lc \"$1\"; }",
          "case \"$A\" in",
          "  status) run_u 'pm2 status' ;;",
          "  logs) if [ \"$S\" = all ]; then run_u \"pm2 logs --lines $N --nostream\"; else run_u \"pm2 logs $S --lines $N --nostream\"; fi ;;",
          "  health) for p in 4000 4001 4002 4003 9100 3000; do printf '%s ' $p; curl -s -o /dev/null -w '%{http_code}\\n' --max-time 5 http://127.0.0.1:$p/health || true; done ;;",
          "  restart) if [ \"$S\" = all ]; then run_u 'pm2 restart all --update-env'; else run_u \"pm2 restart $S --update-env\"; fi ;;",
          "  deploy) run_u 'cd ~/lawie && ./deploy.sh' ;;",
          "  nginx-test) nginx -t ;;",
          "  disk) df -h / && free -m ;;",
          "esac"
        ]
      }
    }
  ]
}
```

Note: `logs` prints service logs only; pino never logs secrets, and the no-env-print hook (T-570) applies to the calling session. `deploy` runs the existing `deploy.sh` (pulls `main`).

## IAM policy `lawie-arjun-ops-policy` (replace ACCOUNT_ID)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "SendOnlyOurDocToOurBox",
      "Effect": "Allow",
      "Action": "ssm:SendCommand",
      "Resource": [
        "arn:aws:ec2:ap-south-1:ACCOUNT_ID:instance/i-0e11d3dd5716776ff",
        "arn:aws:ssm:ap-south-1:ACCOUNT_ID:document/lawie-prod-ops"
      ]
    },
    {
      "Sid": "ReadResults",
      "Effect": "Allow",
      "Action": [
        "ssm:GetCommandInvocation",
        "ssm:ListCommandInvocations",
        "ssm:ListCommands",
        "ssm:DescribeInstanceInformation",
        "ec2:DescribeInstances"
      ],
      "Resource": "*"
    }
  ]
}
```

## Use from the session

```
aws ssm send-command --instance-ids i-0e11d3dd5716776ff --document-name lawie-prod-ops --parameters action=health
aws ssm get-command-invocation --command-id <id> --instance-id i-0e11d3dd5716776ff
```

Environment needs the `aws` CLI and outbound access to `ssm.ap-south-1.amazonaws.com` / `ec2.ap-south-1.amazonaws.com`.

## Proposed v2 of `lawie-prod-ops` (Nikhil, 26 Oct 2026 — founder applies in the console; not live)

Why: (1) `health` probes `/health` on 3000 and web has no such route, so a healthy web always reads 404; (2) `logs` for a process name the box doesn't have fails with pm2's raw error — the develop box is older and may differ; (3) `restart` uses `pm2 restart --update-env`, but pm2 caches env across `restart` (26 Oct drafting crash-loop) — `reload --update-env` is the documented safe path. Parameters unchanged; IAM policy unchanged.

Diff to `runCommand` (only these three lines change):

```diff
-  "  logs) if [ \"$S\" = all ]; then run_u \"pm2 logs --lines $N --nostream\"; else run_u \"pm2 logs $S --lines $N --nostream\"; fi ;;",
+  "  logs) if [ \"$S\" = all ]; then run_u \"pm2 logs --lines $N --nostream\"; elif run_u \"pm2 describe $S >/dev/null 2>&1\"; then run_u \"pm2 logs $S --lines $N --nostream\"; else echo \"no pm2 process named $S on this box; processes:\"; run_u 'pm2 status'; fi ;;",
-  "  health) for p in 4000 4001 4002 4003 9100 3000; do printf '%s ' $p; curl -s -o /dev/null -w '%{http_code}\\n' --max-time 5 http://127.0.0.1:$p/health || true; done ;;",
+  "  health) for p in 4000 4001 4002 4003 9100; do printf '%s ' $p; curl -s -o /dev/null -w '%{http_code}\\n' --max-time 5 http://127.0.0.1:$p/health || true; done; printf '3000 / '; curl -s -o /dev/null -w '%{http_code}\\n' --max-time 10 http://127.0.0.1:3000/ || true ;;",
-  "  restart) if [ \"$S\" = all ]; then run_u 'pm2 restart all --update-env'; else run_u \"pm2 restart $S --update-env\"; fi ;;",
+  "  restart) if [ \"$S\" = all ]; then run_u 'cd ~/lawie && pm2 reload ecosystem.config.js --update-env'; else run_u \"cd ~/lawie && pm2 reload ecosystem.config.js --only $S --update-env\"; fi ;;",
```

Expected `health` output after v2: `4000 200` … `9100 200`, then `3000 / 200`.

Apply (founder): Systems Manager → Documents → `lawie-prod-ops` → Actions → Create new version → paste the edited JSON → **Set as default version**. Then Nikhil runs `action=health` on both boxes and logs it. Rollback: set the previous version as default.

Session note: the CLI in the cloud session ignores `AWS_REGION`; calls need `--region ap-south-1` after the allow-listed prefix.

## Arjun (26 Oct 2026, 12:40 UTC) — develop box: full shell for Nikhil, prod stays narrow

Founder decision: the founder does not want to be the hands for develop-box changes. Ruling: **two keys, two blast radii.**

- **Prod** (`i-0e11d3dd5716776ff`): unchanged — `lawie-arjun-ops` (to be renamed `lawie-nikhil-ops`) may only run the allow-listed `lawie-prod-ops` document. File edits, certbot and env changes on prod remain founder steps over Session Manager until a reviewed document action exists for each (v2 adds `nginx-reload` and `cert-renew`; never a free-form shell).
- **Develop** (`i-07925b68d6dd907c4`): a second IAM user `lawie-dev-shell` with `ssm:SendCommand` on that one instance and the built-in `AWS-RunShellScript` document only, plus result reads. This gives Nikhil any command on the develop box. It cannot reach prod: IAM evaluates every resource ARN in a SendCommand, and that user's policy names no prod ARN. A separate user is required because a single user holding (prod instance, prod doc, dev instance, dev doc) could pair the dev doc with the prod instance.
- Keys: `AWS_DEV_ACCESS_KEY_ID` / `AWS_DEV_SECRET_ACCESS_KEY` in Nikhil's environment; his session writes them into a `dev` CLI profile at start (never echoed) and uses `--profile dev`. The default profile stays the prod-narrow key.
- Guard rails that stay: every develop-box command is one SSM invocation (recorded in SSM command history for 30 days) and one ops-log row; secret VALUES are never passed as command text (SSM logs parameters) — the founder still types them, or Nikhil edits an env line only when the value is non-secret; never `env`/`printenv`; deploy only from `develop`.
- Allow rule: `Bash(aws ssm send-command --profile dev --instance-ids i-07925b68d6dd907c4 --document-name AWS-RunShellScript *)`.

## Document v3 (deploy inline) — Nikhil, 26 Oct 2026 (founder applies; supersedes the v2 proposal above)

Why: on 26 Oct 13:50 UTC `action=deploy` ran the in-git `deploy.sh`, which is the old **laptop** script (`SERVER=ubuntu@13.202.145.184`, `scp` of the env file, then `ssh`). On the prod box that meant prod tried to copy its env file to the develop box's released IP; it timed out before auth (near miss, nothing sent). v3 never calls `deploy.sh`: the deploy runs inline, box-local, no `scp`/`ssh`.

What changes vs v1:

- New parameter `branch` (`main` | `develop`, default `main`). `deploy` checks the instance id over IMDSv2: `main` only on `i-0e11d3dd5716776ff` (prod), `develop` only on `i-07925b68d6dd907c4` (develop); anything else exits 2.
- `deploy` (as `ubuntu`, in `~/lawie`): refuses (exit 4) if tracked files are modified on the box → `git fetch` → `checkout <branch>` → `pull --ff-only` → prints `HEAD <sha>` → reads the env file path from `ecosystem.config.js` (`const ENV_FILE`) and sources it without printing (exit 3 if missing) → `SENTRY_RELEASE` = HEAD → `yarn install --frozen-lockfile --production=false` → build `@lawie/shared`, `@lawie/email-client`, all workspaces → web standalone asset copies → `pm2 reload ecosystem.config.js --update-env` → health gate (10 × 3 s on 4000/4001/4002/4003/9100 `/health` and 3000 `/`; exit 5 on failure) → `DEPLOY OK <sha>`.
- The three v2 fixes are included: `health` probes `/` on 3000; `logs` checks `pm2 describe` first; `restart` is `pm2 reload ecosystem.config.js [--only <svc>] --update-env`.
- `timeoutSeconds` 900 → 2400 (full build on a small box). IAM policy unchanged.

Invocation after it is default:
`aws ssm send-command --instance-ids i-0e11d3dd5716776ff --document-name lawie-prod-ops --parameters action=deploy,branch=main --region ap-south-1`
(develop: same with `--instance-ids i-07925b68d6dd907c4` and `branch=develop`).

Apply (founder): AWS console → Systems Manager → Documents → **Owned by me** → `lawie-prod-ops` → **Actions → Create new version** → replace the content with the JSON below (JSON format) → **Create new version** → back on the document, **Versions** tab → select the new version → **Set default version**. Tell Nikhil the new version number. Rollback: set the previous version as default.

Separately (Priya ticket): the in-git `deploy.sh` must stop being a laptop script; until then nobody runs `./deploy.sh` on either box.

```json
{
  "schemaVersion": "2.2",
  "description": "Lawie prod/develop: allow-listed ops. No free-form shell. v3: deploy inline, box-local, branch-guarded.",
  "parameters": {
    "action": {
      "type": "String",
      "allowedValues": ["status", "logs", "health", "restart", "deploy", "nginx-test", "disk"]
    },
    "service": {
      "type": "String",
      "default": "all",
      "allowedPattern": "^(all|lawie-(gateway|auth|drafting|billing|email-worker|web))$"
    },
    "lines": {
      "type": "String",
      "default": "100",
      "allowedPattern": "^[0-9]{1,3}$"
    },
    "branch": {
      "type": "String",
      "default": "main",
      "allowedValues": ["main", "develop"]
    }
  },
  "mainSteps": [
    {
      "action": "aws:runShellScript",
      "name": "run",
      "inputs": {
        "timeoutSeconds": "2400",
        "runCommand": [
          "set -u",
          "A='{{ action }}'; S='{{ service }}'; N='{{ lines }}'; B='{{ branch }}'",
          "run_u() { sudo -u ubuntu -i bash -lc \"$1\"; }",
          "deploy_guard() {",
          "  TOK=$(curl -s --max-time 5 -X PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 60')",
          "  IID=$(curl -s --max-time 5 -H \"X-aws-ec2-metadata-token: $TOK\" http://169.254.169.254/latest/meta-data/instance-id)",
          "  case \"$B:$IID\" in",
          "    main:i-0e11d3dd5716776ff|develop:i-07925b68d6dd907c4) echo \"deploy $B on $IID\" ;;",
          "    *) echo \"refused: branch $B is not allowed on instance $IID\"; exit 2 ;;",
          "  esac",
          "}",
          "deploy_run() {",
          "  sudo -u ubuntu -i bash -s -- \"$B\" <<'DEPLOY'",
          "set -euo pipefail",
          "BR=\"$1\"",
          "cd ~/lawie",
          "if ! git diff --quiet || ! git diff --cached --quiet; then echo 'refused: tracked files modified on the box:'; git status --short --untracked-files=no; exit 4; fi",
          "git fetch -q origin",
          "git checkout -q \"$BR\"",
          "git pull -q --ff-only origin \"$BR\"",
          "echo \"HEAD $(git rev-parse --short HEAD) on $BR\"",
          "ENVF=$(sed -n \"s/^const ENV_FILE = '\\(.*\\)';$/\\1/p\" ecosystem.config.js)",
          "[ -n \"$ENVF\" ] && [ -f \"$ENVF\" ] || { echo 'refused: env file named in ecosystem.config.js not found'; exit 3; }",
          "set -a; . \"$ENVF\"; set +a",
          "SENTRY_RELEASE=$(git rev-parse HEAD); export SENTRY_RELEASE",
          "echo 'install'; yarn install --frozen-lockfile --production=false",
          "echo 'build packages'; yarn workspace @lawie/shared build; yarn workspace @lawie/email-client build",
          "echo 'build services'; yarn workspaces run build",
          "cp -r apps/web/public/. apps/web/.next/standalone/apps/web/public/",
          "cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static 2>/dev/null || true",
          "echo 'reload'; pm2 reload ecosystem.config.js --update-env",
          "fail=0",
          "for c in 4000/health 4001/health 4002/health 4003/health 9100/health 3000/; do",
          "  code=000",
          "  for i in 1 2 3 4 5 6 7 8 9 10; do",
          "    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 \"http://127.0.0.1:$c\" || true)",
          "    [ \"$code\" = 200 ] && break",
          "    sleep 3",
          "  done",
          "  echo \"health $c $code\"",
          "  [ \"$code\" = 200 ] || fail=1",
          "done",
          "pm2 status",
          "[ \"$fail\" = 0 ] || { echo 'DEPLOY FAILED health gate'; exit 5; }",
          "echo \"DEPLOY OK $(git rev-parse --short HEAD)\"",
          "DEPLOY",
          "}",
          "case \"$A\" in",
          "  status) run_u 'pm2 status' ;;",
          "  logs) if [ \"$S\" = all ]; then run_u \"pm2 logs --lines $N --nostream\"; elif run_u \"pm2 describe $S >/dev/null 2>&1\"; then run_u \"pm2 logs $S --lines $N --nostream\"; else echo \"no pm2 process named $S on this box; processes:\"; run_u 'pm2 status'; fi ;;",
          "  health) for p in 4000 4001 4002 4003 9100; do printf '%s ' $p; curl -s -o /dev/null -w '%{http_code}\\n' --max-time 5 http://127.0.0.1:$p/health || true; done; printf '3000 / '; curl -s -o /dev/null -w '%{http_code}\\n' --max-time 10 http://127.0.0.1:3000/ || true ;;",
          "  restart) if [ \"$S\" = all ]; then run_u 'cd ~/lawie && pm2 reload ecosystem.config.js --update-env'; else run_u \"cd ~/lawie && pm2 reload ecosystem.config.js --only $S --update-env\"; fi ;;",
          "  deploy) deploy_guard && deploy_run ;;",
          "  nginx-test) nginx -t ;;",
          "  disk) df -h / && free -m ;;",
          "esac"
        ]
      }
    }
  ]
}
```

## Arjun (26 Oct 2026, 14:55 UTC) — founder decision A: Nikhil maintains the prod document

The founder chose convenience over the console click: `lawie-arjun-ops` also gets `ssm:UpdateDocument` and `ssm:UpdateDocumentDefaultVersion` on the `lawie-prod-ops` ARN (plus the read actions). Nikhil raised, correctly, that this is equivalent to a root shell on prod for that identity — any runCommand can be written into a new version and run. Accepted by the founder with these controls: every document change is a new version (never an in-place edit of the default), gets an ops-log row and a diff note in this file, and is visible in CloudTrail/SSM version history; the key rotates every 30 days; T-533's pipeline replaces session-driven prod deploys and this grant is removed then. The "prod = allow-listed document only" line in the two-keys section above is superseded by this decision.

### v3 applied as SSM version 2 (26 Oct 2026, 14:58 UTC, Nikhil)

Created by Nikhil with `ssm:UpdateDocument` (founder's option A, granted 14:51 UTC). Content = the JSON above, verified byte-equal via `get-document --document-version 2`. Default version change pending.

### SSM versions 3 and 4 (26 Oct 2026, Nikhil)

- **v3 (SSM version 3):** adds `git checkout -q -- apps/web/next-env.d.ts` before the dirty-tree check (Next.js regenerates it every build; it blocked the first v3 run with exit 4).
- **v4 (SSM version 4):** replaces `set -a; . "$ENVF"; set +a` with a `node --env-file="$ENVF"` loader that emits single-quoted `export` lines into `eval` (dotenv semantics like pm2; values with spaces/quotes/`$` are safe; exit 3 if the file can't be parsed). Reason: an unquoted value with a space in the prod env file broke bash `source` (exit 127). Boxes run node v20.20.2 (`--env-file` needs ≥ 20.6).
- Default version is still **2** (set-default blocked by the session's permission check); until it is 4, call with `--document-version 4`.

### SSM version 5 (26 Oct 2026, 16:20 UTC, Nikhil) — default

Adds `seed-setting`: parameters `key` (`^(ai|pricing|feature)\.[a-z0-9_.]{1,60}$`, default `ai.unset`) and `value` (`^[A-Za-z0-9_.:\-\[\]{},"]{1,200}$`, default `unset`); both assigned single-quoted (`K='{{ key }}'; V='{{ value }}'`), refused if left at defaults; runs `yarn -s workspace @lawie/drafting seed:setting "$K" "$V"` as ubuntu with the env loaded exactly like `deploy` (v4 loader). Invocation: `--parameters action=seed-setting,key=ai.intake_model,value=claude-haiku-5-5`.

### SSM version 6 (26 Oct 2026, 17:31 UTC, Nikhil) — default

Only change vs v5: `key` allowedPattern `^(ai|pricing|feature)\.[a-z0-9_.]{1,60}$` → `^(ai|pricing|feature|finance)\.[a-z0-9_.-]{1,60}$` (hyphen allowed, for `ai.rates.<model-id>`; `finance.` prefix, for `finance.usd_inr`), plus the description line. Everything else equal to v5 (verified by JSON comparison before `update-document`). Approved by Arjun 17:29 UTC. A hyphen is safe in the single-quoted `K='{{ key }}'`. Value values with commas need the JSON `--parameters '{"action":["seed-setting"],"key":[...],"value":[...]}'` form, since the shorthand splits on commas.

### SSM version 7 (26 Oct 2026, 17:34 UTC, Nikhil) — default

Approved by Arjun 17:31 UTC. Adds two read-only actions to v6; nothing else changes:

- `nginx-access`, with param `path` (`^/[a-z0-9/_.-]{1,80}$`, default `/unset`, refused at default) and the existing `lines`. It runs `grep -F -- "$P" /var/log/nginx/access.log | tail -n "$N"` and awk prints only time, method, path with the query string stripped, and status. No IP, referrer or UA. Only the current `access.log` is read, not rotated files.
- `env-has`, with param `name` (`^[A-Z][A-Z0-9_]{1,60}$`, default `UNSET`, refused at default). It derives the env path from `ecosystem.config.js` like deploy does and prints `NAME: set`, `NAME: set but empty` or `NAME: unset` using `grep -c`. It never prints the value. A line written `export NAME=` reads as unset.
- `P='{{ path }}'; E='{{ name }}'` are appended single-quoted to the assignment line.

### SSM version 8 (26 Oct 2026, prepared 19:59, applied 20:00 UTC, Nikhil) — default

JSON: `handoff/ops/runbooks/lawie-prod-ops-v8.json`. Only change vs v7, besides the description: `deploy) deploy_guard && if [ -f /home/ubuntu/lawie/scripts/deploy-local.sh ]; then sudo -u ubuntu -i bash …/deploy-local.sh "$B"; else deploy_run; fi`.

- The document keeps its own branch/instance guard (defence in depth).
- Nothing is exported before the call. `sudo -i` starts a clean login env, so the env file's values aren't shadowed.
- The file check runs before the pull, so the first deploy after T-606 lands uses the inline body. Later deploys use the script.
- To apply: once T-606 is on a box, run `update-document` → `update-document-default-version 8` → ops-log row.
- Applied 20:00 UTC on Arjun's word (20:00 UTC). Status Active, default = 8, `get-document --document-version 8` == repo JSON.

### SSM version 9 (27 Oct 2026, 13:43 UTC, Nikhil) — default

On Arjun's word (13:41 UTC, release v1.2.0). JSON: `handoff/ops/runbooks/lawie-prod-ops-v9.json`; SSM content == repo JSON. Only change vs v8 (besides the description) is the new action `seed-courts`. Its function `seed_courts_run` loads the env exactly like `seed_run`/deploy (v4 loader, as ubuntu) and runs `yarn -s workspace @lawie/drafting seed:courts`. It takes no parameters. The script (`apps/drafting/src/scripts/seed-courts.ts`) is upsert-on-courtId only: idempotent, nothing deleted.

### SSM version 10 (prepared 28 Oct 21:10, applied 29 Oct 2026 09:00 UTC, Nikhil)

JSON: `handoff/ops/runbooks/lawie-prod-ops-v10.json`, built from v9. Plans: `billing-env-2026-10-27.md` and `puppeteer-chrome-2026-10-28.md`. Applied only on the founder's go in Nikhil's chat.

**`env-set`**

- Params are `envkey` and `envvalue`. The runbook's `key`/`value` names are already taken by `seed-setting` with another pattern, so they are not reused.
- `envkey` is an allowedValues list of the 8 runbook names, default `UNSET`. A runtime guard also refuses any name containing KEY, SECRET, TOKEN, PASS, DSN or URI.
- `envvalue` must match `^[A-Za-z0-9@._:/, -]{1,200}$` (no quote, `$` or backslash).
- It finds the env file from line 1 of `ecosystem.config.js`. awk writes a umask-077 temp copy: the exact `KEY=` line is replaced by `KEY="value"`, or the line is appended if absent. A line for a longer name that shares the prefix is untouched (tested locally on a dummy file). The temp copy is `cat`-ed back so the owner and perms stay.
- It checks that exactly one `KEY=` line exists and prints only `set KEY`.

**`puppeteer-chrome`**

- Runs as ubuntu in `apps/drafting`: `npx --no puppeteer browsers install chrome`. `--no` means npx never fetches a different puppeteer from npm.
- Prints only the `chrome@…` line and `chrome ok`.
- Then `pm2 restart lawie-drafting`, the 4002 health gate (10×3 s, exit 5 if not 200) and a `df -h /` line.

Note for billing step 3: pm2 keeps the old env across a plain `restart`. After `env-set`, use the existing `action=restart service=lawie-billing` (then `lawie-email-worker`), which runs `pm2 reload ecosystem.config.js --only <svc> --update-env`.

### SSM version 11 (prepared and applied 29 Oct 2026 09:00 UTC, Nikhil) — default

JSON: `handoff/ops/runbooks/lawie-prod-ops-v11.json`, built from v10 (v10 is itself not applied yet; both are applied on the v1.2.2 go). Plan: `release-v1.2.2-2026-10-29.md` §3. Only change vs v10: the new action `backfill-free-seed`, which takes no params.

- Runs as ubuntu with the env loaded like deploy: `yarn -s workspace @lawie/auth backfill:free-seed --dry-run --cutoff 2026-10-25T22:00:00Z --ids-out /home/ubuntu/.lawie/backfill-ids.tsv`. There is no `--apply` anywhere in the document.
- The dir is 0700; the script creates the ids file 0600 with `wx`, so a leftover file would make the run fail. The action therefore removes any old file before the run and always removes the new one after, whatever the exit code. The ids never leave the box.
- The script prints counts only (its header says no ids or PII on stdout/stderr).
- `print_ids` is not added: the T-657 script has no `--print-ids` option (checked on `release/v1.2.2`). If Ajay needs ids, that is a script change first, then a new version.
- v10 and v11 applied 09:00 UTC 29 Oct on the founder's v1.2.2 go; default = 11; both `get-document` == repo JSON.

### SSM version 12 (29 Oct 2026, 09:09 UTC, Nikhil) — default

Asked by Arjun at 09:08 UTC (Ajay, AJ-657-M1d). JSON: `handoff/ops/runbooks/lawie-prod-ops-v12.json`. The only change from v11, besides the description, is the backfill dry-run constant `--cutoff 2026-10-25T22:00:00Z` → `2026-10-25T20:00:00Z`. It is still dry run only, with no `--apply`. Active, default = 12, content == repo JSON.

### SSM version 13 (29 Oct 2026, 09:38 UTC, Nikhil) — default

Asked by the founder in Nikhil's chat ("set the env variable JWT_EXPIRES_IN to 2d"). JSON: `handoff/ops/runbooks/lawie-prod-ops-v13.json`. The only change from v12, besides the description, is that `JWT_EXPIRES_IN` is added to `env-set`'s `envkey` allowedValues. It passes the runtime secret-name guard (no KEY/SECRET/TOKEN/PASS/DSN/URI in the name). Active, default = 13, content == repo JSON.

### SSM version 14 (29 Oct 2026, 10:05 UTC, Nikhil): Active, NOT default

Asked by Arjun at 10:04 UTC (Ajay). JSON: `handoff/ops/runbooks/lawie-prod-ops-v14.json`. The only change from v13, besides the description, is the new action `get-setting` with param `settingkey` (`^feature\.[a-z0-9_.-]{1,60}$`, default `feature.unset`, refused at default).

- Runs as ubuntu with the env loaded like deploy, from `apps/drafting`.
- `node -e` uses mongoose to read `appsettings.findOne({key})` (value field only). The key is passed as argv, not spliced into the code, and the JS re-checks the feature-only pattern.
- Prints `key=value` or `key unset`. On error it prints only the error name.
- `update-document-default-version 14` was blocked by the session permission check, so the default stays 13. Run get-setting pinned: `--document-version 14`.

### SSM version 15 (29 Oct 2026, 10:09 UTC, Nikhil): Active, NOT default

Asked by Arjun at 10:08 UTC (Ajay, AJ-668-M4). JSON: `handoff/ops/runbooks/lawie-prod-ops-v15.json`. The only change from v14, besides the description, is the new action `count-generations`, with params `templateids` (`^[a-z0-9_]{1,40}(,[a-z0-9_]{1,40}){0,7}$`, default `unset`, refused at default) and `since` (`^YYYY-MM-DDTHH:MM:SSZ$`).

- Runs as ubuntu with the env loaded like deploy, from `apps/drafting`. `node -e` and mongoose read the `generations` collection only.
- For each templateId it prints `before` (createdAt < since) and `since` (≥ since) counts. It then prints the rows since `since`: `_id`, `runId`, `status`, `createdAt` (projection only, so no userId and no content), sorted, capped at 200.
- Params are passed as argv and re-validated in the JS. On error it prints only the error name.
- The default stays 13 (the flip was blocked at 10:05 and not retried); run it pinned with `--document-version 15`.
- Shorthand `--parameters` splits on commas, so send one template per call or use the JSON `--parameters` form for a list.

### SSM version 16 (29 Oct 2026, 11:28 UTC, Nikhil): Active, NOT default

Asked by Arjun at 11:27 UTC (T-681). JSON: `handoff/ops/runbooks/lawie-prod-ops-v16.json`. The only change from v15, besides the description, is the new action `generation-latency`, which takes no params.

- Runs as ubuntu with the env loaded like deploy, from `apps/drafting`.
- A `node -e` mongoose aggregate on `generations` only, for createdAt in the last 24 h and in the last 7 d.
- Grouped by templateId + status, it prints count, how many rows have durationMs, and nearest-rank p50/p95 of `durationMs`. Numbers and template names only.
- Default stays 13; run it pinned with `--document-version 16`.

### SSM version 17 (29 Oct 2026, 11:33 UTC, Nikhil): Active, NOT default

Asked by Arjun at 11:29 UTC (T-678). JSON: `handoff/ops/runbooks/lawie-prod-ops-v17.json`. The only change from v16, besides the description, is the new action `log-window` with params `since` (existing ISO pattern; refused at default) and `runid` (UUID pattern). It reads the files directly as ubuntu, without loading any env:

- **Files:** `/home/ubuntu/.pm2/logs/lawie-drafting-{out,error}-N.log` only.
- **JSON lines with `time` within ±5 s of `since`:** prints the time plus a whitelist of keys (level, event, stage, call, status, stop_reason, runId, code, verdict, gate, gateCode, outcome, reason, model, templateId, kind, msg). A value is printed only if it is a number or boolean, or a string of 60 chars or less with at most two spaces. `err` is reduced to its type or name and code.
- **Plain lines that contain `runid`:** printed only through the first `(k=v, …)` group, with any other text replaced by `<text>` and quoted strings by `<q>`.
- **Testing:** the JS was tested locally on saved prod log samples before publishing.
- **Running it:** default stays 13; run pinned with `--document-version 17`.

## Arjun (29 Oct 2026) — standing go for release deploys (founder, 29 Oct 2026, 11:40 UTC)

Founder's word in Arjun's chat, answering "does merging a `release/*` PR into main count as your standing go for Nikhil to deploy it?": **"yes"**. Context: the prod fix loop — one headline ticket per release, releases cut from `develop_staging` head, Anushka re-checks the headline item after each deploy.

Rule from now on:

- A merge of a `release/*` branch into `main` IS the founder's go to deploy that merge commit to prod. No second message is needed.
- Nikhil learns of the merge from Priya (merge SHA + release tag in his chat) or from his own scheduled check of `origin/main`; either way he verifies the SHA is a `release/*` merge on `main` before deploying — a direct push to main or a hotfix branch is NOT covered and still needs the founder's go in his chat.
- Deploy per the current runbook: `deploy,branch=main` → health → logs → external curls → report to Arjun; rollback point = previous main.
- Everything else on prod (env lines, seeds, document changes beyond read-only actions) still needs the founder's go in Nikhil's chat.

### SSM version 18 (29 Oct 2026, 19:14 UTC, Nikhil): Active, NOT default

Asked by Arjun at 19:09 UTC (CFO's Opus-vs-Sonnet decision). JSON: `handoff/ops/runbooks/lawie-prod-ops-v18.json`. The only change from v17, besides the description, is the new action `token-stats`, which takes no params. It runs as ubuntu with the env loaded like deploy, from `apps/drafting`.

- **Part 1, logs:** reads `lawie-drafting-out-N.log` `event=llm_call` records. For the last 24 h and last 7 d, grouped by stage | call | model, it prints count plus mean/p50/p95 of the 4 token fields, and the earliest record time.
- **Part 2, generations:** reads completed, non-fixture rows (projection: runId, the 4 token totals, llmCalls, calls.sectionId). It prints per-draft mean/p50/p95, how many runs have more than one row, and how many drafts repeat a sectionId call (a retry or repair proxy).
- **Output:** numbers and stage/call/model names only. The JS was tested locally on saved log samples (the log part).
- **Running it:** default stays 13; run pinned with `--document-version 18`.

### SSM version 19 (29 Oct 2026, 19:20 UTC, Nikhil): Active, NOT default

Asked by Arjun at 19:12 UTC (Vikram's reconciliation against the Anthropic Console). JSON: `handoff/ops/runbooks/lawie-prod-ops-v19.json`. The only change from v18, besides the description, is the new action `token-totals`, which takes no params. It runs as ubuntu with the env loaded like deploy.

- **Part 1, logs:** sums the drafting out-log `llm_call` records per model | stage for 24 h, 7 d and month-to-date: calls, input, output, cache_write, cache_read.
- **Part 2, generations:** aggregates per aiModel | runOrigin | status with the same windows: rows, llmCalls, and the 4 token sums.
- **Output:** numbers and model/stage names only. The log part was tested locally.
- **Running it:** default stays 13; run pinned with `--document-version 19`.

### SSM version 20 (29 Oct 2026, 19:35 UTC, Nikhil): Active, NOT default

Asked by Arjun at 19:27 UTC (P1 draft latency). JSON: `handoff/ops/runbooks/lawie-prod-ops-v20.json`. The only change from v19, besides the description, is the new action `timeline` with params `since` (existing), `minutes` (`^[0-9]{1,2}$`) and `runid` (existing). Both `since` and `runid` are required. It reads four things:

- **nginx config (as root):** grep of nginx.conf and sites-enabled for server*name, location, proxy_pass, proxy_buffering, proxy*\*\_timeout, proxy_http_version, proxy_cache, chunked_transfer_encoding, log_format, access_log, gzip and X-Accel-Buffering, with line numbers.
- **nginx access log (as root):** lines in [since, since+minutes]. Each prints UTC time, a client tag (`c` + the first 6 hex chars of sha256 of the remote address), method, path (query stripped; id-like segments → `:id`), status, and any extra numeric fields. Referrer and user agent are dropped.
- **llm_call (as ubuntu):** drafting out-log records in the window: time, stage, call, model, status.
- **generations (as ubuntu, env loaded):** the rows for `runid`: status, runSequence, createdAt, updatedAt, durationMs, llmCalls.

Notes:

- The nginx parser was tested locally.
- The remote address is the Cloudflare edge, so the client tag does NOT identify a browser.
- A wide window overflows SSM's 24 KB output; use small windows.
- Default stays 13; run pinned with `--document-version 20`.

## Founder (29 Oct 2026, 19:35 UTC) — overnight merge authorisation, time-boxed

Founder's words in Arjun's chat: "Arjun may merge release/\* PRs into main until 08:00 IST [30 Oct 2026, 02:30 UTC], provided CI is green on the source and the previous loop's Anushka check passed." He added he is not sure the branch protection allows it: Arjun tries on the next release PR; if GitHub refuses, Arjun push-notifies the founder and the loop pauses at that PR.

Rules while the window is open:

- `release/*` → `main` only; never a hotfix, feature or direct push; never `develop`.
- Preconditions, checked and recorded per merge: CI — Test and Scripts tests green on the release source commit; the previous release's Anushka headline check = PASS; the PR body names one headline ticket.
- After each merge Arjun posts the merge SHA in Nikhil's chat himself (Priya may be asleep); Nikhil deploys under the standing rule; Anushka re-checks; Arjun logs the loop here and in go-live-2026-10-23.md.
- Window closes 08:00 IST 30 Oct; after that the default rule (only the founder merges to main) is back without a further word.

## Standing merge authorisation (founder, 30 Oct 2026, 07:50 UTC)

Founder, verbatim in Arjun's chat: "I am approving you for all the merge to main in future also."

Rule from now on: **Arjun may merge any `release/*` PR into `main`** without a per-release go, provided all of:
1. CI is green on the source `develop_staging` commit the release was cut from;
2. the previous loop's Anushka check on prod passed (or the founder overruled it in writing);
3. the release PR was cut by Priya from `develop_staging` head with the standard exclusions and its "What a user can now do" is in the PR body.
The overnight 08:00 IST window of 29 Oct is superseded. Nikhil's standing deploy go (merge of a `release/*` PR into `main`) is unchanged. Merging `develop_staging` into `develop` stays the founder's alone.
