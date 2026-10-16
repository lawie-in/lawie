# T-376 — Real-model golden set: a required check, with Anushka's six drafts

| Field  | Value                                                                                                                       |
| ------ | --------------------------------------------------------------------------------------------------------------------------- |
| Phase  | 4 — Polish and release                                                                                                      |
| Owner  | Lead (CI + drafting tests)                                                                                                  |
| Mode   | Small fix                                                                                                                   |
| Status | Merged b5961c1 (CI part); AC2-4 wait on the founder's secrets (morning report 0c). Vishal, 14 Oct 2026 |
| Source | Anushka run 3 FAIL; ADR-025 D4                                                                                              |

## Acceptance criteria

1. The real-model golden-set job becomes a required check on pushes that touch the ADR-025 D4 path filter (`drafter.prompts.ts`, `config/document-rules/`, `config/sections/`, the normalizer, the renderer). It also runs nightly.
2. Anushka's six run-3 drafts become fixtures, built from her reproduce steps (handoff/quality/2026-10-13-run-3-develop-FAIL.md): regular bail, anticipatory bail, default bail, Magistrate bail, the s.138 notice and the Delhi plaint. Made-up facts only.
3. The four verifier checks run on each fixture now. The clause-id/fact-ref assertion is added later inside T-373.
4. A baseline results run is committed once the secrets exist. Until then the job is built and dry-run, and the PR says it waits on the founder's secrets.
5. No secret is printed and no document content goes to logs. The lead never runs `--real` locally; only CI runs it with the founder's secrets.

**Sequencing (Priya, 13 Oct):** Vishal's T-373 holds the golden-set harness files (scripts/golden-set/lib, README, harness test, run-3 fixtures). T-376 starts after T-373 merges, or takes over the fixtures by agreement with Vishal.

## Arjun (13 Oct 2026): why run 514 skipped the real golden set

Two reasons, both expected. (1) `ci.yml` job `golden-set` has `if: github.event_name != 'push'` and path-filters only on `pull_request` — it was written for the PR world, and we merge by push now (founder, 11 Oct), so the pre-merge gate never fires. (2) The two secrets are unset, so even a fired job only dry-runs (item 3 on the founder's list). Fix is T-376's, not a new ticket: the job runs on `push` to `develop_staging` when the golden paths changed between `github.event.before` and `github.sha` (paths-filter with `base: ${{ github.event.before }}`), and nightly as today; the secrets gate stays. Whoever holds `.github/workflows/ci.yml` at the time (Vishal's row lists the golden path filter after T-223/T-369) makes the change under T-376. Nothing else for the founder beyond the secrets.

## Arjun (13 Oct 2026)

The golden-set job has `if: github.event_name != 'push'` and path filters only on pull_request, so with merge-by-push it never runs. Fix: run it on push to develop_staging when the golden paths have changed since github.event.before, plus nightly. The secrets gate stays.

**Arjun (14 Oct, concurrency):** the `golden-set` job gets its own concurrency group, `golden-${{ github.sha }}`, with `cancel-in-progress: false`; every other job keeps the per-ref group with cancel. A paid real run is never cancelled by the next push; the next push starts its own golden run only if its golden paths changed. Belongs in T-376 with the push trigger.

## Arjun (14 Oct, 11:10 UTC) — concurrency: option (c)

Vishal is right: a job-level group does not shield a job from the workflow-level `cancel-in-progress: true`, which cancels the whole earlier run when the next push lands on `develop_staging`.

Ruling: **(c)** — move `golden-set` into its own workflow file, `.github/workflows/golden-set.yml`:

- `on`: `push` to `develop_staging`, the existing nightly `schedule`, and `workflow_dispatch`. Delete the `golden-set` job and the T-147e schedule branch of the concurrency group from `ci.yml`; "CI — Test" then goes back to plain `${{ github.workflow }}-${{ github.ref }}` with `cancel-in-progress: true`, and its semantics for every other job are unchanged.
- `concurrency`: `group: golden-${{ github.sha }}`, `cancel-in-progress: false` (the group I asked for in 9325d12e, now at workflow level where it actually holds). A paid run is never cancelled; two pushes in a row run two golden sets, each on its own SHA, which is the intent.
- The path check against `github.event.before` and the secrets gate move with the job unchanged. On `push`, also skip when `github.event.before` is the zero SHA (branch created).
- Not (a): it would stop "CI — Test" cancelling superseded runs on `develop_staging` for no reason. Not (b): same problem, and it changes the run-cancel behaviour every lead depends on.

Claim: `.github/workflows/golden-set.yml` is a new CI file under the root-config claim Vishal already holds for T-376; Priya adds the path to his row.

## Arjun (14 Oct, 11:14 UTC) — path filter and branch protection

1. Add `apps/drafting/src/config/sections/**` to the golden path filter. AC1 names it and the directory exists; the filter in d1200ac is missing it. Nothing else to add.
2. No branch protection requires the old golden job check today: the job has never run (secrets unset, gate skips), and the only required check we asked the founder for is "Web build". AC1's "required check" is a founder action that comes *after* he sets `GOLDEN_SET_ANTHROPIC_API_KEY` / `GOLDEN_SET_MONGODB_URI`, and it must name the job in the new `golden-set.yml` workflow, not the old `ci.yml` one. Priya puts that on his list as one item: "set the two golden secrets, then require the `golden-set` check from the Golden Set workflow on `develop_staging`".
