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
sudo certbot --nginx -d develop.lawie.in -d www.develop.lawie.in -d develop.api.lawie.in
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

## 6. deploy.sh pulls `develop`, not `main` (founder, on the box)
Change the branch in the box-local `~/lawie/deploy.sh` to `develop`, then `git -C ~/lawie checkout develop`. The in-git `deploy.sh` is Priya's ticket (backlog #3); this box-local edit is the stopgap.

**Stop here until the t3.small resize (step 0.5) is done.**

## 7. Build and reload (founder: `cd ~/lawie && ./deploy.sh`, or Nikhil `action=deploy`)
`NEXT_PUBLIC_*` changed, so web must rebuild — `deploy.sh` does a full build. Then `pm2 reload ecosystem.config.js --update-env` (never plain `restart`; pm2 keeps the old env).

## 8. Verify
- Nikhil: `action=health` (200 on 4000–4003, 9100), `action=status` (six online, ↺ not climbing), `action=logs service=lawie-auth lines=20` (environment development, no refuse-to-boot).
- Founder, browser: `https://develop.lawie.in` and `https://www.develop.lawie.in` load; `https://develop.api.lawie.in/health` 200; Google sign-in lands back on the develop host; a Razorpay **test** top-up credits Ink (webhook reached the box).
- Anushka's develop-env runs now use `https://develop.lawie.in` — Priya updates `.claude/docs/quality-gate.md` by ticket.

## Rollback
`git checkout pre-devmove`, restore the old server names and env lines, `nginx -t && reload`, `pm2 reload ecosystem.config.js --update-env`. DNS records stay. Never roll back a secret.

## Log
One ops-log row per step that touches the box (Nikhil adds them; founder tells Nikhil when each step is done).
