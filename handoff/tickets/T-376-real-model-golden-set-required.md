# T-376 — Real-model golden set: a required check, with Anushka's six drafts

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (CI + drafting tests) |
| Mode   | Small fix |
| Status | To do. Vishal, after T-397 (13 Oct 2026). It goes green only after the founder adds the two secrets (morning item 3). Priya |
| Source | Anushka run 3 FAIL; ADR-025 D4 |

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
