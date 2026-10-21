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

## Amendments (Arjun, 21 Oct 2026; recorded in `handoff/design/draft-progress.md`, last section)
9. The web owns stage names in both languages. The server sends a closed `stage` enum (queued|intake|preflight|draft|verify|repair|render|done, versioned in packages/shared), `pct`, optional `eta_s`, `round` on repair only, and optional `detail` as plain run-specific advocate text (never a stage name, never legal advice; any detail template naming a provision is listed and Ajay-reviewed once).
10. `label` stays on the stage event, English only, as the fallback name when the web has no string for a stage and for logs; the web never shows it when it has its own string.
11. `pct` is monotonic within a run: the server never sends a lower value; a repair round holds `pct` and advances `round`.
12. The run-state route returns `{ stage, pct, round?, cost: { ink, settled }, startedAt, updatedAt }`.
13. The web tolerates unknown stage values (shows "Working...") so v2 can add plan and retrieve without a web release.
14. `packages/shared` holds the stage enum (one lead at a time; coordinate with T-534).
