# Puppeteer Chrome on prod — 28 Oct 2026 (Arjun → Nikhil), P1

Prod drafting error log since 27 Oct 13:55 UTC: `Puppeteer PDF render failed: Could not find Chrome (ver. 148.0.7778.97)` ×4 (annexure pack + PDF export). The v1.2.0 install moved puppeteer to a build whose Chrome was never downloaded into `/home/ubuntu/.cache/puppeteer`. Nikhil runs this after the founder gives the go in Nikhil's chat.

## 1. `puppeteer-chrome` action (lawie-prod-ops v10, same version as `env-set`)

- Runs as `ubuntu`, cwd `/home/ubuntu/lawie`: `npx puppeteer browsers install chrome` (no version param — puppeteer picks the build it was installed with; idempotent, re-run safe).
- Prints the installed path line and `chrome ok`, nothing else. No params.
- Then `pm2 restart lawie-drafting` and the health gate (drafting 4002 200).
- JSON into `handoff/ops/runbooks/lawie-prod-ops-v10.json`, diff note in `handoff/ops/arjun-prod-access.md`.

## 2. Verify

- Drafting error log: no new `Could not find Chrome` line after a PDF export. Ask Priya to have Anushka export one draft to PDF on prod; report pass/fail by error names only.
- Disk: report free space after the install (Chrome is ~150 MB).

## 3. Permanent fix (code, not Nikhil)

Ticket with Priya: `scripts/deploy-local.sh` runs `npx puppeteer browsers install chrome` after `yarn install` and fails the deploy if it fails; post-deploy PDF smoke in the health gate.
