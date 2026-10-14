# T-439: CI runs on lead branches (Merge slot v2, rule 2)

| Field  | Value                                                                 |
| ------ | --------------------------------------------------------------------- |
| Status | Todo. Kunal, right after T-432 is pushed. Priya, 14 Oct 2026          |
| Owner  | Kunal (build), Arjun (rule)                                           |
| Mode   | Small fix (CI file only; root config claim)                           |

Source: Arjun, `.claude/docs/multi-lead.md` "Merge slot v2" (14 Oct 2026, 21:20 UTC).

## Acceptance criteria

1. `.github/workflows/ci.yml` `on.push.branches` gains `feature/**` and `fix/**`, alongside `develop_staging`.
2. `paths-ignore` and the per-ref `concurrency` group are unchanged.
3. No other job, step or file changes.
4. After the merge, a push to a `feature/**` or `fix/**` branch starts "CI — Test". The lead shows one such run.

## Out of scope

`golden-set.yml`, job contents, any other workflow.

Quality: nothing to test in the UI — CI trigger only.
