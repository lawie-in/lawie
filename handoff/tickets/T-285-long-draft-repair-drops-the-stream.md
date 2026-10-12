# T-285 — A long repair pass can drop the draft stream

| Field          | Value |
| -------------- | ----- |
| Phase          | 4 — Polish and release |
| Owner          | Arjun scopes. Founder (production nginx). Lead (build) |
| Mode           | Small fix |
| Status         | To do. Unassigned. Found by Mahak (T-226), 12 Oct 2026 |

Production nginx has `proxy_read_timeout` of 60 s. The repair pass sends nothing on the stream, so a long repair can exceed 60 s and the connection drops, even though the draft may complete. Pre-existing. Fix options for Arjun: send a keep-alive from the repair pass, and/or raise the timeout on the production host (founder task).

## Acceptance criteria

1. A repair pass of more than 60 s does not drop the stream.
2. The T-226 hold TTL (30 min) is not shortened by this.

## Arjun (12 Oct 2026)

**Cause, checked in code.** In `apps/drafting/src/services/ai.service.ts` both repair loops (the clause repair ≈ l.1213 and the fact repair ≈ l.1299) write one `event: repair` line and then only collect text into a string (`repairRaw += text`). Nothing reaches the client until they finish. The repo's `docker/nginx/nginx.prod.conf` has `proxy_read_timeout 60s` for the whole server; any 60 s of upstream silence closes the connection. The same silence exists before the first section and during the fact check. `X-Accel-Buffering: no` is already set on the four streams (l.449, 677, 1053, 1554), so this is the read timeout, not buffering.

**Decision: fix it in code with a heartbeat. No change to the host is required.**
- One helper `startSseKeepAlive(res, intervalMs = 15000)` returns a `stop()`. It writes the SSE comment `: keep-alive\n\n` while the response is open and not ended. Start it right after the headers on each of the four streaming functions (l.446, 674, 1050, 1551); stop it in a `finally`, on `res.on('close')`, and before the final `done` or `error` event.
- Why a comment line: a line starting with `:` is ignored by every SSE reader. The web readers in `new/page.tsx` (l.330) and `OneFlow.tsx` (l.636) only act on `event: ` and `data: ` lines, so they skip it. No web change. The gateway proxy passes bytes through unchanged.
- 15 s is a quarter of the 60 s limit, so one lost beat still stays inside it. Do not make it configurable.
- Put the helper in a small new file (`apps/drafting/src/utils/sse-keepalive.ts`) so the T-226 lead's `withInkHold` can use it too without a merge fight in `documents.routes.ts`.

**Acceptance criteria (replaces the two above; both stay)**
1. A stream whose model calls take 90 s (fake timers, mocked LLM) sends at least one `: keep-alive` line every 15 s and still ends with `done`.
2. No heartbeat is written after `done` or `error`, after the client disconnects, or after `res.end()` (no write-after-end error, no leaked timer: a test asserts the interval is cleared on all three).
3. The four streaming functions each start and stop it (one test each, or one parametrised test).
4. Existing stream tests and the golden set are unchanged: the heartbeat is a comment, not an event.
5. T-226's hold TTL stays at 30 minutes and its sweep is untouched. A heartbeat does not extend a hold.
6. CI green on drafting.

**Files:** `apps/drafting/src/services/ai.service.ts` (four starts, legal-content path: Ajay is told the diff is transport only and changes no prompt, rule or output), new `apps/drafting/src/utils/sse-keepalive.ts`, tests. Nothing in `documents.routes.ts`, so no overlap with T-226 or T-115a, but `ai.service.ts` is also touched by the T-241/T-245a bail work: the lead checks `leads.md`.

**Founder (optional, later, not part of this ticket):** if the real production host later serves the stream through its own nginx rather than this repo's config, give the stream location `proxy_read_timeout 300s`. With the heartbeat the 60 s default is fine, so this is only a safety margin. Whoever sets up the T-403 production host should copy `proxy_buffering off` and a 300 s timeout for `/api/drafting/` into that location.

**Also (T-226, Mahak, via Priya):** the hold TTL of 30 minutes is accepted. A crashed run keeps its Ink up to 30 minutes before the sweep releases it; that is acceptable at 25 users.
