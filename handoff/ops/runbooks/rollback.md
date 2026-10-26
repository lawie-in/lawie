# Runbook: rollback (app code)

Owner: Nikhil (DevOps). Source: `handoff/ops/go-live-2026-10-23.md` §7. Draft — Arjun reviews.

## When
A deploy fails health, crash-loops, or the founder's smoke fails on something the release introduced. Production down → tell Arjun and the founder at once.

## Rules
- Roll back to the `pre-<version>` tag made before the deploy (`deploy.md` §1). No tag → stop; ask Arjun for the last good SHA.
- **Never roll back a secret.** Rotated keys stay rotated; env file is not reverted unless the founder decides a specific NAME was wrong.
- Data is not rolled back by this runbook (Atlas restores are the founder's call).
- Log every step.

## Steps (founder via Session Manager until `lawie-prod-ops` carries a rollback action)
```
cd ~/lawie
git checkout pre-<version>
yarn install --frozen-lockfile --production=false
yarn workspaces run build          # shared → email-client → all, as deploy.sh
# web static copy: the two cp lines from deploy.sh
pm2 reload ecosystem.config.js --update-env
```
If an env NAME the release added breaks boot of the older code, the founder removes that line, then reload again with `--update-env`.

Put the coming-soon switch back only if the founder asks (server-only, not in git).

## Verify (Nikhil, SSM)
`action=health`, `action=status`, `action=logs service=lawie-auth lines=20` — same expectations as `deploy.md` §3.

## After
- Ops-log row: `rollback to pre-<version> (<sha>)`, who asked, result.
- Box is now in detached HEAD at the tag; next deploy (`git checkout main && git pull`) is a deliberate step, not automatic.
- Report to Arjun; Priya gets a ticket for the defect. Post-incident note `handoff/ops/incident-<date>-<slug>.md` if users were affected.
- Data window: sign-ups/payments made on the bad release stay in the DB; check billing webhooks credited (`pm2 logs lawie-billing`, names only).

Expected time: ~10 minutes.
