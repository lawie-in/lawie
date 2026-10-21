# Draft progress: real state of a draft, live, from the backend

Founder, 21 Oct 2026: "show users the real state of the draft — a progress bar with realtime messages from the backend. I'm thinking socket sessions; if you have something better, include it." Arjun's ruling.

## What exists

Drafting already streams every generation over **Server-Sent Events** (`text/event-stream`, `X-Accel-Buffering: no`, heartbeat beats): `event: done`, `error`, `warning`, `repair`, `checklist`, `template_sections`, `postprocess`, plus the token stream. The web reads it with a streaming `fetch`, not `EventSource`. There is **no resume** (no `id:` lines, no `Last-Event-ID`), no stable `stage` event, and the known silences (T-285: repair and fact-check send nothing for up to a minute) are what make the UI look stuck.

So the gap is not the transport. It is that the pipeline never says *where it is*.

## Ruling: SSE, upgraded — not WebSockets

| | SSE (keep) | WebSocket / Socket.IO |
|---|---|---|
| Direction we need | server → client only (progress, tokens, done). Cancel is one `POST`. | bidirectional — we have no second direction yet |
| Through nginx / ALB | plain HTTP; works today; ALB idle timeout ≥ 120 s (already in the pipeline notes) | needs `Upgrade` config, ALB sticky sessions or a pub/sub layer, a second auth path for the handshake |
| Scale-out (T-537) | a run lives on one HTTP connection; nothing to share | socket ↔ run mapping must live in Redis; every instance subscribes |
| Reconnect | built into the protocol: `id:` + `Last-Event-ID`, browser retries on its own | hand-rolled or Socket.IO's, plus buffer replay we would write |
| Cost | ₹0, no dependency | one more library in web and drafting, one more thing to operate |
| Right for | this | collaborative editing, live presence, chat — v2, if ever |

Decision: **stay on SSE; add stage events, ids and resume.** Revisit WebSockets only when a feature needs client → server messages mid-run.

## Design

1. **`event: stage`** emitted by the pipeline at every transition, from one place (`emitStage()` in the run context), never ad hoc:
   ```
   event: stage
   id: <runId>:<seq>
   data: {"stage":"retrieve","label":"Reading the court rules for Patna District Court","pct":35,"startedAt":…,"eta_s":12}
   ```
   Stages (v1 pipeline): `queued` → `intake` (facts read) → `preflight` (checks) → `draft` (tokens follow; `pct` advances with sections) → `verify` (fact check) → `repair` (0–2 rounds, each its own stage event) → `render` → `done`. `label` is written for an advocate, not a developer, and is Ajay-reviewed where it names law. `pct` is honest: computed from stages reached and sections written, never a timer. `eta_s` from the per-stage median of the last 50 runs (Generation records), shown as "about 10 s", hidden when unknown.
2. **Silences end.** Every stage that can run longer than 10 s (verify, repair, render) sends `event: stage` progress ticks with `detail` ("checked 4 of 9 citations"), which also closes T-285's nginx timeout for good.
3. **Resume.** Every event carries `id: <runId>:<seq>`. The last 200 events of a live run are kept in Redis (`run:<runId>:events`, TTL 10 min). `GET /documents/runs/:runId/stream` with `Last-Event-ID` replays from there and then continues live. The web switches from `fetch` streaming to `EventSource` (or keeps `fetch` and sends the header itself) and reconnects on its own. Ties into T-521's rule: a stream that ended without a server event is "connection lost", and now it can also *recover*.
4. **Run state is queryable.** `GET /documents/runs/:runId` returns the last stage and `pct`, so a refreshed page or the documents list shows "Verifying… 70 %" without a stream.
5. **Cancel** is `POST /documents/runs/:runId/cancel`; the pipeline checks a cancel flag between stages; Ink is released by the existing `finish()` rule.
6. **UI** — Rajesh designs it (section 7: no UI change without his design): a stage list with the current step, the honest bar, the label, the eta, and the "connection lost — reconnecting" state. Operate surface; `impeccable` + `animate` rules from `.claude/docs/ui-quality.md`.

## Scope and order

- Ticket A (drafting): `emitStage`, the stage map, ticks in verify/repair/render, `id:` lines, Redis event buffer, resume route, run-state route, cancel. Tests: stage order per fixture, resume after a cut at every stage, cancel between stages releases Ink.
- Ticket B (web, after Rajesh's design): progress component, reconnect, run-state on refresh.
- Phase: after the v1 batch; before the first paying cohort (it is what makes a 60-second draft feel alive). v2's compiler pipeline (plan → retrieve → draft → verify → repair → render, ADR-026) emits the same `stage` events — the design is shared, so build it once.
- No new dependency. No WebSocket. No Socket.IO.
