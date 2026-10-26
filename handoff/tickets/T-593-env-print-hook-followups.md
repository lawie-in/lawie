# T-593: Env-print hook and secret scan follow-ups (from T-570 round 3)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (security hygiene; item 1 is HIGH) |
| Owner  | Arjun (design), a lead (build; root config, .claude, scripts) |
| Mode   | Small fix (hook script + scan + tests + CI) |
| Status | To do. Raised 26 Oct 2026 from Mahak's T-570 round 3 report (not a round 4). Priya |
| Source | T-570 reviewer findings, Mahak's report |

## Acceptance criteria
1. HIGH: a jq `#` comment containing a `"` throws off the string-literal blanking, so `# "` newline `env | tostring # "` hides `env` and prints the whole environment. Fix: strip jq comments before the literal pass, or fail closed on `#`. Test for it.
2. All-caps joined labels outside DENY_JOINED (for example HMACSECRET, RAZORPAYSECRET, MYTOKEN) are not denied by the scan allowlist. Close the gap with a test.
3. Nothing in CI runs `scripts/__tests__` (scripts is not a workspace), and the new workflow gates only if branch protection requires it. Run the scripts tests in CI and tell the founder which check to make required.
4. `release/**` in the workflow trigger is an assumption. main will carry no `.github`, `handoff` or `.claude` under T-533, so confirm the pattern and the main story with Arjun.
5. Known fail-closed false positives (any `\(` in a jq literal, any `/proc` plus `*`): document them in the hook header so nobody is surprised.
6. Deferred from T-570: pre-commit blocks when gitleaks is missing, once gitleaks is in the dev image (Arjun's ruling).

## Files
Same as T-570 (root config held by one lead at a time): .claude/hooks/no-env-print.*, scripts/secret-shape-scan.mjs and tests, .github/workflows/secret-shape-scan.yml, .husky/pre-commit, root package.json. Claimed by Priya when a lead takes it, after T-570 merges.

## More bypass routes (26 Oct 2026, from Mahak's T-594 reviewer; HIGH, pre-existing)
- bash $'...' decoder turns \cX, \r, \a, \e, \f, \v into letters, so `jq -n $'# "\cJenv # "'` still prints env.
- `--argfile` (2 args) is missing from withArg.
- `jq -n -- '-1, env'` finds no filter.
- Earlier: --library-path, -f, `$ENV`, import/include.
