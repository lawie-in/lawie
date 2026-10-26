# T-606: Replace deploy.sh with a box-local deploy script (HIGH)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (ops/security; type: ops; first code ticket when the stop lifts) |
| Owner  | Arjun (design, this ticket), Nikhil (consumes it), a lead (build; root config + docs) |
| Mode   | Full chain (root config deploy.sh and docs). Fresh reviewer mandatory |
| Status | To do. Raised by Arjun, 26 Oct 2026, HIGH. NOT assigned: starts when the founder lifts the stop. Priya |
| Source | Arjun's finding of 26 Oct 2026 |

## Problem
`deploy.sh` on main and develop_staging is the old laptop script. It scp's the production env file to a hard-coded IP, 13.202.145.184 (the develop box's OLD public IP, released on resize; AWS can reassign it), and ssh-runs the deploy. The prod box's SSM deploy action called it today and it timed out before auth, so nothing left the box. A retry could push prod secrets to a stranger's machine.

## Acceptance criteria
1. Delete the scp/ssh wrapper. New `scripts/deploy-local.sh <main|develop>` is the inner body: fetch, checkout, `pull --ff-only`; env sourced from the path in `ecosystem.config.js` line 1 (never a literal path); `yarn install --frozen-lockfile --production=false`; build shared, email-client and all workspaces; the web standalone asset copies; `pm2 reload ecosystem.config.js --update-env`; the T-442 health gate including GET / on 3000.
2. Branch guard: refuses `main` on the develop box and `develop` on prod (instance id via IMDSv2).
3. No scp, no ssh, no IP literal anywhere in the file. Keep the T-586 `SENTRY_RELEASE` export (after the env is sourced).
4. `docs/DEPLOY.md` updated.
5. Tests: shellcheck, and a bats or jest smoke that the script contains no `scp`, `ssh` or IP literal.
6. Nikhil then consumes it from the SSM document. Interim (Arjun): Nikhil puts the same body inline into the SSM document (founder applies) so prod can deploy today.

## Files
Root deploy.sh (removed or replaced), new scripts/deploy-local.sh, docs/DEPLOY.md, tests. Root config is held by Mahak until T-594 merges: sequence after T-594, or ask Priya to extend. Claimed by Priya when a lead takes it.
