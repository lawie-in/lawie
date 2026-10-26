# T-570: Block env-printing commands; scan handoff/ and .claude/ for secret shapes

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (security hygiene; before main) |
| Owner  | Arjun (design), a lead (build; small fix, root config) |
| Mode   | Small fix (hook script + tests + one CLAUDE.md line) |
| Status | To do. Posted 22 Oct 2026 on Arjun's request after the env-dump incident. Priya |
| Source | `handoff/ops/incident-2026-10-22-env-dump.md` (Arjun) |

## Problem
A tester subagent ran `export -n` and printed the shell environment into its transcript. The cloud environment injects real product secrets into every agent session. Nothing external is known to be exposed (severity medium). The founder rotates and trims the environment config; this ticket stops it happening again.

## Acceptance criteria
1. A PreToolUse hook in `.claude/` blocks env-printing commands: `env`, `printenv`, `export -n`/`export -p`, `set`, `declare -x`, reads of `/proc/*/environ`, and `node -p`/`node -e` forms that print `process.env`. Checking whether a variable is set (without printing it) stays allowed. Test cases for each blocked form and for the allowed check.
2. The crew protocol line in `CLAUDE.md` gains "never print the environment" (one line; CLAUDE.md stays short).
3. A scan for secret shapes (AWS key ids, Mongo URIs with credentials, `rzp_`, JWT-like, long hex) over files under `handoff/` and `.claude/`, runnable as a script and wired into the existing test or CI step the way T-543 does for `.env.example`. It must pass on the current tree (any hit is reported to Arjun, not committed).
4. No secret value appears in the hook, the tests or the report.

## Files (Priya claims when a lead takes it)
`.claude/settings.json` (hook entry), new hook script under `.claude/`, `CLAUDE.md` (one line), scan script and test. Root config: one lead at a time. Not before a lead is free.

## Added 22 Oct 2026 (Shashank)
The standard test command in docs uses `env -u REDIS_URL -u SENTRY_DSN yarn ...`. Shared form from now on: `(unset REDIS_URL SENTRY_DSN; yarn workspace @lawie/<ws> test)` (subshell unset, prints nothing). Acceptance criterion 5: update every doc that mentions `env -u` (CLAUDE.md and .claude/docs) to this form; the hook must not block the subshell form.

## Arjun's ruling (26 Oct 2026): where the secret scan fails closed
- Approved: (c)+(b). `.husky/pre-commit` runs `scan:secrets` (fast, no binary needed) and keeps the gitleaks warning; the new workflow `.github/workflows/secret-shape-scan.yml` is the fail-closed gate.
- Reviewer conditions: `scan:secrets` finishes under about 2 s on a normal staged set and never prints a matched value (file:line and shape name only). The workflow runs on pushes to develop_staging, develop and main and on the release branch pattern.
- DEFERRED, not forgotten: (a) pre-commit blocks when gitleaks is missing, once gitleaks is installed in the dev image. Follow-up ticket when that image change lands.
