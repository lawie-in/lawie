# Runbook: develop box → `develop.lawie.in` / `www.develop.lawie.in` / `develop.api.lawie.in`

Owner: Nikhil (DevOps). Executed by the **founder** over Session Manager (the SSM document cannot edit files). Source: founder's 23 Oct decision in `handoff/ops/go-live-2026-10-23.md`; hostnames per the Cloudflare records the founder set on 25 Oct. **The go-live doc's `development.lawie.in` / `api.development.lawie.in` wording is superseded by the names here.** Approved by Arjun 26 Oct with amendments. Run only when the founder schedules it.

Box: `i-07925b68d6dd907c4` (public IP changes on each start; was `13.202.145.184`). At 26 Oct 11:31 UTC: six `lawie-*` online, disk 76% (4.6G free), RAM 909M total (238M available), swap 2G.

## 0. Before (Nikhil, SSM; founder)
1. Nikhil: `action=health`, `action=status`, `action=disk`; log it.
2. Founder: rollback tag on the current checkout: `cd ~/lawie && git tag pre-devmove`.
3. Note which Atlas DB the box points at: it must stay the **develop** cluster, never prod's. Name only, not the URI.

## 0.5 Capacity — decided (founder, 26 Oct 2026)
**Resize to t3.small chosen.** The founder resizes it in the console (stop → change type → start). **No Elastic IP:** the public IP changes on every start. The box is then kept **stopped** and started only when needed. IP changes and DNS updates are handled by `dev-box-start-stop.md`; use that runbook to start the box for this move.
- Free disk first if under ~3 GB free: `yarn cache clean`, `rm -rf ~/lawie/apps/web/.next/cache`, `pm2 flush`.

## 1. DNS — verify only (founder already set these 25 Oct)
`dig +short develop.lawie.in`, `dig +short www.develop.lawie.in` and `dig +short develop.api.lawie.in` each return the box's **current** public IP (set by the start runbook; DNS-only/grey cloud while certbot runs).

## 2. nginx server names (founder, Session Manager)
In the box's site config(s) under `/etc/nginx/sites-available/`:
- web block: `server_name develop.lawie.in www.develop.lawie.in;`
- api block: `server_name develop.api.lawie.in;`
- Keep the `location = /webhooks/razorpay` → `127.0.0.1:4003/webhook/razorpay` route (as on prod).
- Remove any `lawie.in` / `www.lawie.in` / `api.lawie.in` names from this box — prod owns them.
- `sudo nginx -t && sudo systemctl reload nginx` (Nikhil confirms with `action=nginx-test`).

## 3. TLS (founder)
```
sudo certbot --nginx -m admin@lawie.in -d develop.lawie.in -d www.develop.lawie.in -d develop.api.lawie.in
sudo certbot renew --dry-run
```
Old `lawie.in` certs on this box: `sudo certbot delete --cert-name <old name>` once the new ones work.

## 4. Env file NAMES that change (founder types values; Nikhil never sees them)
One env file, the one `ecosystem.config.js` names. Values with spaces or commas double-quoted; no trailing `#` comments.
| NAME | new value |
|---|---|
| `FRONTEND_URL` | `https://develop.lawie.in` |
| `ALLOWED_ORIGINS` | `https://develop.lawie.in,https://www.develop.lawie.in` |
| `NEXT_PUBLIC_API_URL` | `https://develop.api.lawie.in` (**web rebuild**) |
| `GOOGLE_CALLBACK_URL` | `https://develop.api.lawie.in/api/auth/google/callback` |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | **test** mode values |
| `RAZORPAY_PLAN_ID` + `RAZORPAY_PLAN_*` | **test** plan ids |
| `RAZORPAY_KEY_GUARD` | unset or warn-only |
| `TEST_SIGNUP_BYPASS` + `TEST_SIGNUP_BYPASS_SECRET` | allowed here only |
| `MONGO_URI` | the develop cluster (unchanged), never prod's |
| `SENTRY_ENVIRONMENT` / `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | `development` (web rebuild for the public one) |

## 5. External consoles (founder)
- **Google Cloud console** → OAuth client → Authorized redirect URIs: add `https://develop.api.lawie.in/api/auth/google/callback`; authorized JS origins `https://develop.lawie.in`, `https://www.develop.lawie.in`. Remove the box's old entries only after step 8 passes.
- **Razorpay dashboard (Test mode)** → Webhooks: URL `https://develop.api.lawie.in/webhooks/razorpay`, same events as prod; secret = the test `RAZORPAY_WEBHOOK_SECRET` in the env file.

## 6. The box deploys `develop`, not `main`
No edit is needed on the box. `scripts/deploy-local.sh` (T-606) takes the branch as an argument, and its guard allows only `develop` on this instance. The document's `deploy` has the same guard and needs `branch=develop`. Just `git -C ~/lawie checkout develop` (as ubuntu).

**Stop here until the t3.small resize (step 0.5) is done.**

## 7. Build and reload (Nikhil `action=deploy,branch=develop`, or founder: `sudo -u ubuntu -i bash ~/lawie/scripts/deploy-local.sh develop`)
`NEXT_PUBLIC_*` changed, so web must rebuild — `scripts/deploy-local.sh` does a full build (the document's inline fallback does the same if the script isn't on the box yet). Then `pm2 reload ecosystem.config.js --update-env` (never plain `restart`; pm2 keeps the old env).

## 8. Verify
- Nikhil: `action=health` (200 on 4000–4003, 9100), `action=status` (six online, ↺ not climbing), `action=logs service=lawie-auth lines=20` (environment development, no refuse-to-boot).
- Founder, browser: `https://develop.lawie.in` and `https://www.develop.lawie.in` load; `https://develop.api.lawie.in/health` 200; Google sign-in lands back on the develop host; a Razorpay **test** top-up credits Ink (webhook reached the box).
- Anushka's develop-env runs now use `https://develop.lawie.in` — Priya updates `.claude/docs/quality-gate.md` by ticket.

## Rollback
`git checkout pre-devmove`, restore the old server names and env lines, `nginx -t && reload`, `pm2 reload ecosystem.config.js --update-env`. DNS records stay. Never roll back a secret.

## Log
One ops-log row per step that touches the box (Nikhil adds them; founder tells Nikhil when each step is done).

---

## Nikhil-executed variant (steps 2–8) — dev key `lawie-dev-shell`
Authority: Arjun's ruling in `handoff/ops/arjun-prod-access.md` (develop key section), 26 Oct 2026. Develop box only; prod stays on `lawie-prod-ops` with the default profile.

### Rules
- Every command has this shape, **one command per invocation**, one ops-log row per step:
  `aws ssm send-command --profile dev --instance-ids i-07925b68d6dd907c4 --document-name AWS-RunShellScript --parameters 'commands=["<cmd>"]' --region ap-south-1`
  then `aws ssm get-command-invocation --profile dev --command-id <id> --instance-id i-07925b68d6dd907c4 --region ap-south-1`.
- `AWS-RunShellScript` runs as **root**; pm2/git/deploy run as `ubuntu` via `sudo -iu ubuntu bash -lc '<cmd>'`.
- **Secret VALUES never appear in a command** — SSM stores parameters and output for 30 days. Secret env lines (Razorpay test keys/webhook secret, `TEST_SIGNUP_BYPASS_SECRET`, `MONGO_URI`, anything credential-shaped) stay **founder-typed** over Session Manager. Nikhil edits an env line only when its value is non-secret (a URL, an environment name).
- Never `env`/`printenv`/`cat` of an env file; check an env line only by count, e.g. `grep -c '^FRONTEND_URL=https://develop.lawie.in$' <ENV_FILE>`.
- `nginx -t` before **every** nginx reload; reload only if it passed.
- Deploy only from `develop`. Never touch `lawie.in` / `www.lawie.in` / `api.lawie.in` here.

### 0. Session start — profile bootstrap (every restart)
```
mkdir -p ~/.aws && umask 077 && cat > ~/.aws/credentials <<CREDS
[dev]
aws_access_key_id = ${AWS_DEV_ACCESS_KEY_ID}
aws_secret_access_key = ${AWS_DEV_SECRET_ACCESS_KEY}
CREDS
```
(The heredoc expands the variables into the file; nothing is echoed. Never `cat` the file.) Then:
`aws sts get-caller-identity --profile dev --query Arn --output text --region ap-south-1` → must end in `user/lawie-dev-shell`. Anything else: stop, tell Arjun and the founder. The default profile must still say `lawie-arjun-ops`.

### Pre. Rollback tag + backups
1. `sudo -iu ubuntu bash -lc 'git -C ~/lawie tag -f pre-devmove'`
2. `cp /etc/nginx/sites-available/lawie /etc/nginx/sites-available/lawie.bak-devmove`

### 2. nginx server names
1. `sed -i 's/server_name lawie.in www.lawie.in;/server_name develop.lawie.in www.develop.lawie.in;/; s/server_name api.lawie.in;/server_name develop.api.lawie.in;/' /etc/nginx/sites-available/lawie`
2. `grep -n -e server_name -e webhooks/razorpay /etc/nginx/sites-available/lawie` — only develop names; razorpay route present (else add it, as on prod).
3. `nginx -t`
4. only if 3 passed: `systemctl reload nginx`

### 3. TLS
1. `dig +short develop.lawie.in www.develop.lawie.in develop.api.lawie.in` — each equals the box's current IP (grey cloud).
2. `certbot --nginx --non-interactive --agree-tos -m admin@lawie.in -d develop.lawie.in -d www.develop.lawie.in -d develop.api.lawie.in` (`admin@lawie.in` is the standard certbot contact for all Lawie boxes; Arjun, 26 Oct 2026).
3. `nginx -t` → `systemctl reload nginx`
4. `certbot renew --dry-run`
5. `certbot certificates` — note the old lawie.in cert name; after step 8 passes: `certbot delete --non-interactive --cert-name <old name>` → `nginx -t` → reload.

### 4. Env file
1. Find the file (names only): `grep -oE '[A-Za-z0-9_./-]*\.env[A-Za-z0-9_.-]*' /home/ubuntu/lawie/ecosystem.config.js | sort -u` → `<ENV_FILE>`.
2. `cp <ENV_FILE> <ENV_FILE>.bak-devmove` (root-only perms preserved; never read it).
3. Nikhil, non-secret lines only, one `sed -i 's#^NAME=.*#NAME=value#' <ENV_FILE>` per line, each followed by its `grep -c` check:
   `FRONTEND_URL=https://develop.lawie.in`; `ALLOWED_ORIGINS="https://develop.lawie.in,https://www.develop.lawie.in"`; `NEXT_PUBLIC_API_URL=https://develop.api.lawie.in`; `GOOGLE_CALLBACK_URL=https://develop.api.lawie.in/api/auth/google/callback`; `SENTRY_ENVIRONMENT=development`; `NEXT_PUBLIC_SENTRY_ENVIRONMENT=development`. If a NAME is absent (`grep -c` = 0), stop and ask — don't append blindly.
4. **Founder-typed** (Session Manager): Razorpay test `KEY_ID` / `KEY_SECRET` / `WEBHOOK_SECRET`, test `RAZORPAY_PLAN_*`, `RAZORPAY_KEY_GUARD` unset/warn, `TEST_SIGNUP_BYPASS*`, and confirm `MONGO_URI` is the develop cluster. Nikhil then checks presence only: `grep -c '^RAZORPAY_KEY_ID=rzp_test_' <ENV_FILE>` (prefix check, no value printed).

### 5. External consoles — founder (unchanged)
Google OAuth redirect URI + JS origins; Razorpay **test** webhook `https://develop.api.lawie.in/webhooks/razorpay`.

### 6. Box on `develop`
1. No script edit (branch is an argument to `scripts/deploy-local.sh`).
2. `sudo -iu ubuntu bash -lc 'git -C ~/lawie fetch origin develop && git -C ~/lawie checkout develop && git -C ~/lawie rev-parse --abbrev-ref HEAD'` → `develop`.

### 7. Build and reload
1. `lawie-prod-ops action=deploy,branch=develop` on `i-07925b68d6dd907c4` (runs `scripts/deploy-local.sh develop` when present, else the inline body; full build; `NEXT_PUBLIC_*` changed). Long-running: pass `--timeout-seconds 1800` on the send-command and poll the invocation.
2. `sudo -iu ubuntu bash -lc 'cd ~/lawie && pm2 reload ecosystem.config.js --update-env'` (never plain `restart`).

### 8. Verify
Nikhil: `lawie-prod-ops action=health|status|logs service=lawie-auth lines=20` (default profile) — 200 on 4000–4003 + 9100, six online, ↺ flat, environment development. Plus `curl -s -o /dev/null -w '%{http_code}' https://develop.api.lawie.in/health` from the box → 200.
Founder, browser: both web hosts load; Google sign-in returns to develop; Razorpay **test** top-up credits Ink.

### Rollback (dev key)
`cp lawie.bak-devmove` back → `nginx -t` → reload; `cp <ENV_FILE>.bak-devmove` back; `git -C ~/lawie checkout pre-devmove` (as ubuntu); `pm2 reload ecosystem.config.js --update-env`. Never roll back a secret.
