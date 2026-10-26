# Runbook: develop box → `development.lawie.in` / `api.development.lawie.in`

Owner: Nikhil (DevOps). Executed by the **founder** over Session Manager (the SSM document cannot edit files). Source: founder's 23 Oct decision and "The development box after the move" in `handoff/ops/go-live-2026-10-23.md`. Draft — Arjun reviews. Run only when the founder schedules it.

Box: `i-07925b68d6dd907c4`, `13.202.145.184`. At 26 Oct 11:31 UTC: six `lawie-*` online, disk 76% (4.6G free), RAM 909M total (238M available) — clear space before building (step 0).

## 0. Before (Nikhil, SSM; founder)
1. Nikhil: `action=health`, `action=status`, `action=disk` on the box; log it.
2. Founder: free disk if under ~5G free — `yarn cache clean`, old `apps/web/.next/cache`, old pm2 logs (`pm2 flush`). A web build on 909M RAM needs the 2G swap that is already on.
3. Founder: rollback tag on the current checkout: `cd ~/lawie && git tag pre-devmove`.
4. Note which Atlas DB the box points at: it must stay the **develop** cluster (never prod's). Name only, not the URI.

## 1. DNS (founder, Cloudflare)
- `A development.lawie.in → 13.202.145.184`
- `A api.development.lawie.in → 13.202.145.184`
- DNS-only (grey cloud) until certbot succeeds; then proxy if wanted.
- Check: `dig +short development.lawie.in` and `api.development.lawie.in` both return the IP.

## 2. nginx server names (founder, Session Manager)
In the box's site config(s) under `/etc/nginx/sites-available/`:
- web block: `server_name development.lawie.in;` (was `lawie.in www.lawie.in`)
- api block: `server_name api.development.lawie.in;` (was `api.lawie.in`)
- Keep the `location = /webhooks/razorpay` → `127.0.0.1:4003/webhook/razorpay` route (as on prod).
- Remove any `lawie.in` / `api.lawie.in` names from this box — prod owns them now.
- `sudo nginx -t && sudo systemctl reload nginx` (Nikhil can confirm with `action=nginx-test`).

## 3. TLS (founder)
```
sudo certbot --nginx -d development.lawie.in -d api.development.lawie.in
sudo certbot renew --dry-run
```
Old `lawie.in` certs on this box: `sudo certbot delete --cert-name <old name>` once the new ones work (prod has its own).

## 4. Env file NAMES that change (founder types values; Nikhil never sees them)
One env file, the one `ecosystem.config.js` names. Values with spaces double-quoted; no trailing `#` comments.
| NAME | new value shape |
|---|---|
| `FRONTEND_URL` | `https://development.lawie.in` |
| `ALLOWED_ORIGINS` | `https://development.lawie.in` |
| `NEXT_PUBLIC_API_URL` | `https://api.development.lawie.in` (**web rebuild**) |
| `GOOGLE_CALLBACK_URL` | `https://api.development.lawie.in/api/auth/google/callback` |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | **test** mode values |
| `RAZORPAY_PLAN_ID` + `RAZORPAY_PLAN_*` | **test** plan ids |
| `RAZORPAY_KEY_GUARD` | unset or warn-only |
| `TEST_SIGNUP_BYPASS` + `TEST_SIGNUP_BYPASS_SECRET` | allowed here only |
| `MONGO_URI` | the develop cluster (unchanged), never prod's |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` / `SENTRY_ENVIRONMENT` | `development` (web rebuild for the public one) |

## 5. External consoles (founder)
- **Google Cloud console** → OAuth client → Authorized redirect URIs: add `https://api.development.lawie.in/api/auth/google/callback`; authorized JS origin `https://development.lawie.in`. Remove the dev box's old entries only after step 8 passes.
- **Razorpay dashboard (Test mode)** → Webhooks: URL `https://api.development.lawie.in/webhooks/razorpay`, same events as prod; webhook secret = the test `RAZORPAY_WEBHOOK_SECRET` in the env file.

## 6. deploy.sh pulls `develop`, not `main` (founder, on the box)
The box-local `~/lawie/deploy.sh` must check out and pull `develop`. Change the branch in it to `develop` and `git -C ~/lawie checkout develop`. The in-git `deploy.sh` is Priya's ticket (backlog #3); this box-local edit is the stopgap.

## 7. Build and reload (founder: `cd ~/lawie && ./deploy.sh`, or Nikhil `action=deploy` once step 6 is done)
`NEXT_PUBLIC_*` changed, so web must rebuild — `deploy.sh` does a full build. Then `pm2 reload ecosystem.config.js --update-env` (never plain `restart`; pm2 caches env).

## 8. Verify
- Nikhil: `action=health` (200 on 4000–4003, 9100), `action=status` (six online, ↺ not climbing), `action=logs service=lawie-auth lines=20` (environment shows development, no refuse-to-boot).
- Founder, browser: `https://development.lawie.in` loads; `https://api.development.lawie.in/health` 200; sign-in with Google lands back on the dev host; a Razorpay **test** top-up credits Ink (webhook reached the box).
- Anushka's develop-env runs now use `https://development.lawie.in` — Priya updates `.claude/docs/quality-gate.md` by ticket.

## Rollback
`git checkout pre-devmove`, restore the old server names and env lines, `nginx -t && reload`, `pm2 reload ecosystem.config.js --update-env`. DNS records can stay. Never roll back a secret.

## Log
One ops-log row per step that touches the box (Nikhil adds them; founder tells Nikhil when each step is done).
