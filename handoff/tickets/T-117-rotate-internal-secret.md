# T-117 — Rotate INTERNAL_SECRET and remove it from the test script

| Field      | Value                                                                |
| ---------- | -------------------------------------------------------------------- |
| Phase      | 0 — Prep                                                             |
| Owner      | Vishal. The production step needs the founder's go-ahead at the time |
| Mode       | Small change, plus one production step                               |
| Status     | Ready. Vishal picks this first (founder, 4 Oct 2026)                 |
| Depends on | None                                                                 |
| Branch     | fix/t-117-internal-secret-default                                    |
| Created    | 2026-10-04                                                           |

## Goal

Production runs on a new internal secret, and no file in git carries a real one.

## Context

- Founder, 4 Oct 2026: do the rotation, and Vishal picks this ticket first.
- `scripts/test-templates/run-all.sh`, line 82, has a default value for `INTERNAL_SECRET`. It is the same value as in `.env.production` and `.env.development`. Compared by hash on 4 Oct 2026; the value was not printed.
- The script has been in git since commit `f0e3586`. It is on `develop` and on `main`, and both are pushed to GitHub.
- Deleting the default does not take the value out of git history. Rotating is the fix. No history rewrite is needed once the old value stops working.
- Five services read `INTERNAL_SECRET`: gateway, auth, billing, drafting and email-worker. They must all get the new value in the same deploy, or calls between them fail.
- `.env` (local) already holds a different value. Development and production share one today.
- The pre-commit hook only warns when `gitleaks` is not installed, so this was never scanned.
- The T-004 batch uses this script, so it runs after this ticket.

## Acceptance criteria

- `.env.production` has a new random value (`openssl rand -hex 32`). `.env.development` has a different new value.
- All five services are redeployed together. The health checks pass, and one call that crosses services works (for example one draft through the gateway).
- A request to an internal route with the old value is refused.
- `run-all.sh` has no default. With `INTERNAL_SECRET` unset it stops with a one-line message. `scripts/test-templates/README.md` says how to pass it.
- `gitleaks version` works on the laptop. `gitleaks detect` is run once over the repo, and any other hit is listed in this file by file and line, with no values.
- `.gitleaks.toml` catches a hard-coded default of this shape, so the same mistake fails a commit.
- This file records where production takes its env from. `docker-compose.prod.yml` says AWS Secrets Manager; `deploy.sh` copies `.env.production` from the laptop. If Secrets Manager holds a copy, it is updated too.
- The new values appear in no commit, ticket, log line or chat message.

## In scope

- `scripts/test-templates/run-all.sh` and `scripts/test-templates/README.md`
- `.gitleaks.toml`
- `.env.production` and `.env.development` (not in git)
- One production deploy

## Out of scope

- Rewriting git history
- Rotating any other secret, unless `gitleaks detect` finds one. That gets its own ticket.
- Replacing the shared secret with per-service secrets

## References

- Design: Not needed
- ADR: Not needed
- Legal sign-off: Not needed
- Found by Vishal in T-004, "Also found"

## Progress (4 Oct 2026)

Code part done on branch `fix/t-117-internal-secret-default`, commit `8116279`, worktree `../lawie-t117`. Not pushed, no pull request yet.

- `run-all.sh` has no default. With `INTERNAL_SECRET` unset it prints one line and exits 1 (checked). The README says how to pass it.
- `.gitleaks.toml` has two new rules: `lawie-secret-shell-default` and `lawie-internal-secret`. A test file with a random shell default was caught.
- `gitleaks version` is 8.30.1 (installed with Homebrew). The pre-commit hook now scans for real.

### `gitleaks` over the repo, history included (values not shown)

| File                                                                          | Line                    | Rule                                       | Verdict                                                                                         |
| ----------------------------------------------------------------------------- | ----------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `scripts/test-templates/run-all.sh`                                           | 82 (history, `f0e3586`) | both new rules                             | Real. Same value as `.env.production`, `.env.development` and `.env.demo`. Fixed by this ticket |
| `apps/{auth,billing,drafting,gateway,email-worker}/src/__tests__/setupEnv.ts` | 4, 8, 9, 10, 11         | `lawie-internal-secret`, `generic-api-key` | Test placeholders. Match no `.env` value                                                        |
| `LOCAL-SETUP-DECISION.md`                                                     | 88                      | `lawie-mongo-uri-with-password`            | Local Mongo URI. Not a credential                                                               |
| `.env.demo.example`                                                           | 16                      | `lawie-mongo-uri-with-password`            | Example placeholder                                                                             |
| `.github/workflows/ci.yml`                                                    | 57                      | `lawie-mongo-uri-with-password`            | CI test database. Matches no `.env` value                                                       |

No other secret to rotate.

### Still to do (needs the founder's go-ahead)

1. New values with `openssl rand -hex 32`: one for `.env.production`, a different one for `.env.development`. `.env.demo` holds the old value too, so it gets one as well.
2. Where production takes its env from: `docker-compose.prod.yml` line 5 says CI/CD writes `.env.production` from AWS Secrets Manager, and `deploy.sh` copies it from the laptop. Check whether Secrets Manager holds a copy, and update it too.
3. Redeploy all five services together. Then run the health checks, send one draft through the gateway, and confirm the old value is refused.
4. Pull request for the branch.
