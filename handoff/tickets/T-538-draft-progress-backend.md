# T-538: Drafting progress events (SSE stages, ticks, resume, run-state, cancel)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — after the v1 batch, before the first paying cohort |
| Owner  | Arjun (design: `handoff/design/draft-progress.md`), a drafting lead (build), Ajay (any label that names law) |
| Mode   | Full chain (drafting) |
| Status | To do. Founder ask 21 Oct 2026: a real progress bar with live backend messages; Arjun's ruling: our existing SSE, no WebSockets, no new dependency. Priya |
| Source | `handoff/design/draft-progress.md` |

## Acceptance criteria
1. `event: stage` emitted from one place (`emitStage()` in the run context), with `id: <runId>:<seq>` and data `{stage,label,pct,startedAt,eta_s}`. Stages: queued, intake, preflight, draft, verify, repair (0 to 2 rounds, each its own event), render, done.
2. `pct` is honest (stages reached and sections written, never a timer). `eta_s` from the per-stage median of the last 50 runs, hidden when unknown. Labels are written for advocates; Ajay reviews any label that names law.
3. Stages that can run over 10 s (verify, repair, render) send progress ticks with `detail` (for example "checked 4 of 9 citations"); this also closes T-285's timeout for good.
4. Resume: the last 200 events of a live run kept in Redis (`run:<runId>:events`, TTL 10 min); `GET /documents/runs/:runId/stream` with `Last-Event-ID` replays then continues live.
5. `GET /documents/runs/:runId` returns the last stage and `pct`.
6. `POST /documents/runs/:runId/cancel`; the pipeline checks a cancel flag between stages; Ink is released by the existing `finish()` rule.
7. Tests: stage order per fixture, resume after a cut at every stage, cancel between stages releases Ink.
8. No new dependency. No WebSocket.
