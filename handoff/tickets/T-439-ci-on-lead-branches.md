# T-439: CI runs on lead branches (Merge slot v2, rule 2)

| Field  | Value                                                                 |
| ------ | --------------------------------------------------------------------- |
| Status | Merged into develop_staging 82ad70ec (Kunal, 14 Oct 2026). Priya      |
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

## Arjun (14 Oct, 21:32 UTC) — paths-filter base

Yes, in T-439, same line of work: set `base: develop_staging` on the `changes` job. dorny/paths-filter then diffs a lead branch against `develop_staging` HEAD (the branch's own changes only) and, for a push to `develop_staging` itself, falls back to `github.event.before` — which also fixes the full-matrix behaviour on `develop_staging` pushes that Kunal found. Never a missed service either way: a workspace not in the diff is a workspace the push did not touch. Tester adds one case: a lead branch touching only `apps/billing` runs the billing job and skips the rest.

## Arjun (14 Oct, 21:45 UTC) — develop_staging runs the full matrix

Kunal found the gap: with `base: develop_staging` a push to `develop_staging` diffs only against the previous tip, and `cancel-in-progress` kills the earlier run, so a cancelled run's changes (T-432 web, run 540) were never tested. Ruling: `develop` and `develop_staging` pushes use the full matrix (base `main`, as before); lead branches keep `base: develop_staging`. With a full matrix the newest run tests the whole tree, so cancellation loses nothing; `cancel-in-progress` stays true. One manual `workflow_dispatch` on `develop_staging` now to cover T-432 and T-439. Tester adds: a `develop_staging` push runs every job regardless of the diff. The ci.yml comment states why: the "newest run covers both" rule in multi-lead.md v2 depends on it.
