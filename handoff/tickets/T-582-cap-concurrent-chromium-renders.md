# T-582: Cap concurrent Chromium renders

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Scale (before the prod box; not blocking the v1 batch; parked until after Anushka's first run) |
| Owner  | Arjun (design), a lead (build; drafting) |
| Mode   | Small fix (drafting only) |
| Status | To do. Posted 23 Oct 2026 on Arjun's request. Priya |
| Source | Arjun, 23 Oct 2026; Vikram's scaling artifact |

## Problem
Each Puppeteer page render (annexures pack, PDF export) takes about 200–300 MB. On a 4 GB prod box, uncapped concurrent renders are the first thing to fall over under load, after Anthropic rate limits.

## Acceptance criteria
1. A semaphore of 2 around every Puppeteer page render in drafting (annexures pack and PDF export, and any other render found in Explore).
2. A request beyond the limit queues; if it has waited 30 seconds it gets 503 `{error:"try_again"}`.
3. Ids-only logging (no document content, no PII).
4. A test with a mocked renderer: 3 concurrent renders run 2 at a time; the third waits; a wait over 30 s returns 503; a failing render releases its slot.

## Files
Claimed by Priya when a lead takes it: the drafting render helper(s) (Explore finds them), annexures.service.ts only after Mahak's T-579 has merged; tests.
