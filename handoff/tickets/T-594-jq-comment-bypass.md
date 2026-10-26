# T-594: Close the jq comment bypass in the env-print hook (HIGH, tonight)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (security hygiene; HIGH) |
| Owner  | Arjun (design), Mahak (build, right after T-570 merges) |
| Mode   | Small fix (hook + its test only; fresh tester) |
| Status | To do. Raised by Arjun, 26 Oct 2026, split from T-593 item 1. Priya |
| Source | T-570 round 3 reviewer finding |

## Problem
A jq `#` comment containing a `"` throws off the string-literal blanking in `.claude/hooks/no-env-print.*`, so `# "` newline `env | tostring # "` hides `env` and prints the whole environment.

## Acceptance criteria
1. Strip jq comments before the literal pass, or fail closed on `#` in any jq program. A test for the exact bypass above and for a harmless jq program that still passes.
2. Only if it is one line in `.github/workflows/ci.yml`: run `scripts/__tests__` in CI (T-593 item 3). Otherwise leave it in T-593.
3. Nothing else. T-593 items 2, 4, 5, 6 stay for the morning.

## Files
.claude/hooks/no-env-print.sh and .mjs and their tests; .github/workflows/ci.yml only for the one line in AC2. Mahak holds root config until this merges. Starts after T-570 merges (same files).
