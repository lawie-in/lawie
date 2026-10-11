# T-249 — CI skips pushes that change only docs

| Field          | Value |
| -------------- | ----- |
| Phase          | 0 — Prep |
| Owner          | Lead (build). Arjun (glance at the path list) |
| Mode           | Small fix. Root config (`.github/workflows/ci.yml`): one lead holds it |
| Status         | Merged into develop_staging (ef73910, 12 Oct 2026). `docs/**` is deliberately NOT ignored (docs/templates/*.json are runtime overrides). Follow-up below |

## Problem

`ci.yml` runs on every push to `develop_staging`, with `cancel-in-progress: true`. Tonight five sessions push docs often: Priya (tickets), Ajay (handoff/legal), Meera (handoff/marketing) and the leads. Each push starts a full run and cancels the one before it. The founder gets a "cancelled" notification for each, and a lead's real merge run can be cancelled before it finishes.

## Acceptance criteria

1. Add `paths-ignore` to the `push` and `pull_request` triggers: `handoff/**`, `.claude/**`, `docs/**`, `**/*.md`. A push that changes code and docs still runs.
2. The nightly `schedule` and `workflow_dispatch` are unchanged.
3. Proof: one docs-only push starts no run, and the next code push runs normally.

## Follow-up (shashank, 12 Oct 2026)

The `changes` job's drafting filter does not include `docs/templates/**`, so a templates-only push runs CI but skips the drafting tests. Add `docs/templates/**` to the drafting filter. Tiny; goes to shashank after T-248.
