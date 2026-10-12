# T-288 — A failed re-hold on a lost hold must not send `done`

| Field          | Value |
| -------------- | ----- |
| Phase          | 1 — Pricing and credits |
| Owner          | Mahak (same files as T-226, so after it merges). Arjun accepted the gap |
| Mode           | Small fix |
| Status         | Merged to `develop_staging` (66753fc, 12 Oct 2026). Waiting for Anushka on develop |

In T-226, when the hold is gone at settle time (the sweep got there first), the code takes the hold again once. If that second `holdInk` throws on a database fault (not a refusal for a spent balance), the route still sends `done` for a draft that was never paid. Worst case today is one free draft, and it needs a stall longer than 30 minutes plus a database fault in the same window. Arjun accepted it so T-226 could merge.

## Acceptance criteria

1. A re-hold that throws is handled like a refused re-hold: send the error event with the same 402-style text, send no `done`, and log at error level with the run id.
2. A test: lost hold at settle, re-hold throws, no `done` is sent and the error is logged.
3. (Mahak) The AC9 grep that checks billing renewal and cancel do not touch the user fields also covers `inkSettled`.
4. (Mahak) Three logs in `credits.service.ts` log `err.name`; they log `err.message` instead (no personal data in the message).
5. Files: `credits.service.ts` and the `withInkHold` wrapper in `documents.routes.ts` only, plus tests. Drafting only; no Ajay, no legal path.

## Gates

- Design: Not needed
- ADR: Not needed
- Legal sign-off: Not needed
