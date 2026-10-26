# Runbook: deploy (prod `lawie-prod` and the develop box)

Owner: Nikhil (DevOps). Source: `handoff/ops/go-live-2026-10-23.md` §5, the 26 Oct progress log and release note. Draft — Arjun reviews.

## Rules
- Prod (`i-0e11d3dd5716776ff`) deploys `main` only. Develop box (`i-07925b68d6dd907c4`) deploys `develop` only.
- Deploy through `lawie-prod-ops action=deploy,branch=<main|develop>`. From v8 the document runs the box's own `scripts/deploy-local.sh <branch>` (T-606) as ubuntu. If that file isn't on the box yet, it falls back to the inline body. The founder on the box uses `sudo -u ubuntu -i bash ~/lawie/scripts/deploy-local.sh <branch>`. The old repo-root laptop script is retired (T-606): never run it.
- Request must come from the founder (Nikhil's chat) or Arjun's session, naming branch + expected head SHA.
- Every step that touches a box gets an `ops-log.md` row.
- Env values are typed by the founder over Session Manager. This runbook only ever names variables.

## 0. Before
1. Confirm branch and expected SHA (`main` head on GitHub matches the SHA named).
2. Read the latest release note in the go-live doc: which services deploy, which env NAMES are new/changed.
3. Any `NEXT_PUBLIC_*` change → web must rebuild (values baked at `next build`). `scripts/deploy-local.sh` rebuilds all, so a full deploy covers it.
4. Env file edits (founder): values with spaces double-quoted; no trailing `#` comments on a value (the 26 Oct `ENCRYPTION_KEY` crash-loop).
5. Anushka's PASS for the cut, or the founder's written waiver (v1.0.0 was waived; later releases are not).

## 1. Rollback tag (founder, Session Manager, until the document carries it)
```
cd ~/lawie && git tag pre-<version>     # e.g. pre-v1.0.1; first was pre-v1
```
Note the current HEAD short SHA in the ops log row.

## 2. Deploy
- SSM: `aws ssm send-command --instance-ids i-0e11d3dd5716776ff --document-name lawie-prod-ops --parameters action=deploy,branch=main --region ap-south-1` (develop box: its instance id + `branch=develop`). The document's branch/instance guard runs first.
- Or founder: `sudo -u ubuntu -i bash ~/lawie/scripts/deploy-local.sh main`. It refuses to run as root, and nothing may be exported in the calling shell, because a variable already set there wins over the env file.

`scripts/deploy-local.sh` body, in order:
- branch guard (IMDSv2 instance id: `main` on prod only, `develop` on the develop box only)
- refuse root, a dirty tracked tree and a diverged branch
- fetch → checkout → `pull --ff-only`
- env loaded with `node --env-file` from the path on line 1 of `ecosystem.config.js` (values never printed) → `SENTRY_RELEASE`
- `yarn install --frozen-lockfile --production=false` (because `NODE_ENV=production` skips `tsc`) → build shared → email-client → all → copy web static → `pm2 reload ecosystem.config.js --update-env` → health on 4000/4001/4002/4003/9100/3000.
Manual order if needed: drafting (then `seed:courts` on a fresh DB), auth, billing, gateway, email-worker, web.

## 3. Verify
1. `action=health` → 200 on 4000/4001/4002/4003/9100. Port 3000: web has no `/health` (404); check `/` = 200 and pm2 `lawie-web` online.
2. `action=status` → all six `lawie-*` online; note restart counts — any rising ↺ = crash loop → `pm2-recovery.md`.
3. `action=logs service=lawie-auth lines=20` → `Environment: production`, no refuse-to-boot line.
4. Drafting `/health` `config_warnings` should be empty (T-585; empty is not proof the `ai.*` settings exist).
5. Billing boot log names the key mode (live) — the only key-related line read.
6. Public: `https://lawie.in` and `https://api.lawie.in/health` 200.

Never `pm2 env`, `env`, `printenv`.

## 4. After
- Ops-log row: date, box, `deploy <sha>`, who asked, health result.
- Report to Arjun: SHA, health lines, pm2 table, anything odd.
- Any failure → `rollback.md`.

## pm2 gotcha
pm2 caches env across `restart`. After env edits use `pm2 reload <app|ecosystem.config.js> --update-env`, or `pm2 delete` + `pm2 start ecosystem.config.js`.
