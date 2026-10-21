# T-539: Drafting progress in the web app (progress component and reconnect)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — after the v1 batch, before the first paying cohort |
| Owner  | Rajesh (design first: no UI change without his design), a web lead (build) |
| Mode   | Full chain (web); gated on Rajesh's design and on T-538 |
| Status | Waiting for Rajesh's design brief (sent 21 Oct 2026). Priya |
| Source | `handoff/design/draft-progress.md`, section 6 of the Design list |

## Design brief for Rajesh
A stage list with the current step, the honest bar (pct from the server, never a timer), the advocate-worded label, the eta ("about 10 s", hidden when unknown), and the "connection lost, reconnecting" state. Operate surface; `impeccable` and `animate` rules from `.claude/docs/ui-quality.md`. Stages: queued, intake, preflight, draft, verify, repair, render, done. Also: refreshed page shows "Verifying... 70 %" from the run-state route; cancel button; a stream that ended without a server event is "connection lost" and can now recover.

## Acceptance criteria
1. Progress component and reconnect (EventSource or fetch with Last-Event-ID) per Rajesh's design.
2. Run-state on refresh and on the documents list.
3. Cancel from the progress view.
4. The "no Ink was used" line only on a server error event whose code is not insufficient_ink (T-521 rule).
5. Browser check; Rajesh reviews; Ajay sees any label that names law.
