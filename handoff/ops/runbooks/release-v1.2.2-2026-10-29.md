# v1.2.2 prod release — 29 Oct 2026 (Arjun → Nikhil)

PR #107 (release/v1.2.2 from develop_staging c1d9c1c9) → main; the founder merges and gives the go in Nikhil's chat with the merge SHA. One go covers everything below, in this order.

## 1. Deploy (v9 `deploy,branch=main` → scripts/deploy-local.sh)

- The script now runs `yarn install` (auth package.json changed), builds shared, installs Puppeteer's Chrome itself (`npx --no-install puppeteer browsers install chrome`, T-649) and runs a PDF smoke after the health gate. So the separate `puppeteer-chrome` action is **no longer needed** — skip it; keep the action in v10 for emergencies.
- Service order inside the script is fixed; if the script deploys all six in one pass, that's fine (auth, drafting, web all change). No env change; `EARNED_CREDITS_SPEND_ENABLED` stays off/unset.
- Verify: health 4000–4003/9100 + 3000 `/` 200; the script's PDF smoke line `PDF smoke ok`; drafting error log shows no new `Could not find Chrome`; external lawie.in + api.lawie.in/health 200. Report disk free after Chrome.

## 2. Billing env lines (v10 `env-set`, runbook billing-env-2026-10-27.md)

- Apply after step 1 is green: GST_EFFECTIVE_FROM=2026-06-19, EMAIL_REPLY_TO=contact@lawie.in, EMAIL_FROM_ADDRESS=noreply@lawie.in only if `env-has` says unset.
- `restart service=lawie-billing`, then `lawie-email-worker` (reload --update-env). Watch the invoice sweep: expect 2 invoices for the two captured ₹65 top-ups of 25 Oct; report counts and error names only.

## 3. T-657 free-Ink backfill — DRY RUN only (v11 action `backfill-free-seed`)

- Add to the document (v11): runs as ubuntu, cwd apps/auth, `yarn ts-node scripts/backfill-free-seed.ts --cutoff 2026-10-25T22:00:00Z --ids-out /home/ubuntu/.lawie/backfill-ids.txt` with env loaded like deploy. No `--apply` param exists in v11. Optional param `print_ids=<class>` runs the script's `--print-ids <class>` (bare ObjectIds, cap 200) only when Arjun asks on Ajay's request.
- The ids file stays on the box, 0600 ubuntu, never printed or copied by the action; delete it within 24 h (`rm` step in the same action after the run, unless print_ids is requested later — then delete after that).
- Output to Arjun: counts per class (auto-safe / ambiguous / manual / near-cutoff) and nothing else. Arjun forwards to Ajay. `--apply` is a separate v12 action, added only after Ajay's written OK.

## 4. Report

Health, SHA on box, PDF smoke result, invoice counts, backfill counts — to Arjun; rows in the ops log.

## Corrections (Nikhil, 08:56 UTC; accepted by Arjun)

- The deploy action runs the box's copy of `scripts/deploy-local.sh` from BEFORE the pull, so the v1.2.2 deploy still runs the v1.2.1 script: no Chrome install, no PDF smoke this time. Step 1 is therefore followed by v10 `puppeteer-chrome` (install, drafting restart, 4002 health, disk free). The new script's smoke runs from the next release on.
- The T-657 script has no `--print-ids`; v11 `backfill-free-seed` = `--dry-run --cutoff 2026-10-25T22:00:00Z --ids-out ~/.lawie/backfill-ids.tsv` (dir 0700, file 0600, deleted after the run). Counts only. Ids for Ajay need a script change first.
