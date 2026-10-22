# T-567: Legal fixes, server messages, billing gate and Word export (review sections B and C, server items)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (MUST items block Anushka's browser run) |
| Owner  | Lead (build), Ajay byte-checks |
| Mode   | Full chain (billing, gateway, email-worker, drafting messages, web export) |
| Status | To do. Mahak after T-472. MUST items 23, 30, 41 before Anushka. Priya, 22 Oct 2026 |
| Source | Ajay's pre-Anushka legal review: `handoff/legal/pre-anushka-legal-review-22-oct.md` (22 Oct 2026, b871e0f7) |

## Items
**23 MUST:** remove the privacy gate from `/cancel` in `apps/billing/src/routes/billing.routes.ts` so a 'Not now' user can still cancel and close their account (no copy change; test it). **30 MUST:** every Word export carries the PDF's footer (`exportDocx` in the editor export utils; a starting draft carries its own signed footer instead, so exactly one). **41 MUST:** user-facing server messages in `documents.routes.ts` and `ai.service.ts` become AJ-539-M2 text; the server's own text goes to logs only; no internal configuration shown, no blame on the facts. Then SHOULD: 24 (gateway rate-limit message, no upsell), 25 (welcome mail preheader and footer, before it is wired; after T-559 merges the same templates), 52 (remove unrendered credit-sku badges, AJ-535-M3), 26 and 27 stay for T-529. Item 28: no change. Conflicts: T-559 (mail templates) is separate and unbuilt; coordinate before touching email-worker templates.

## Rules for every item
Signed fix text is in the review file next to its item number (file:line, current text, signed fix). Paste it **byte for byte**; if a line has moved, find it by the current text. Anything unclear goes to the real Ajay (session_019mZoKeM2MTfCyV5HEZrqnZ), never invented. Files under `.claude/docs/legal-content-paths.md` come back to Ajay for a byte check at READY. Do not touch files held by another lead's claim row; wait for their merge or ask Priya.

## Arjun (22 Oct 2026) — item 41: the "No Ink was used" contract

**Contract.** SSE `error` events carry `inkReleased?: boolean`. **Absent or `false` = not confirmed.** `true` only when `releaseInk` returned success for this run — never inferred, never defaulted. Since every current emitter fires before or without that confirmation, **today every error event is sent without the field** (option 1). Option 2 — `release()` returns a status and the two route-level events set `inkReleased: true` when it succeeded — is the follow-up once Mahak's chain merges, and is the only way the line ever comes back.

**Web (Tanvi, T-565, `generationFailure.ts`):** the Ink line is shown only when `inkReleased === true`; otherwise "The draft did not finish." + "Check your documents list to see where this draft stands." (Ajay confirms copy.) This also supersedes my T-521 rule ("show the line on any server error event except insufficient_ink") — that rule assumed the server knew; it does not.

**`reason`.** Keep the field, but it is user-facing text: only strings from the signed `classifyLlmError` table or an Ajay-signed message; anything else is replaced by `''` and the internal text goes to the log with the runId. **`documents.routes.ts` ≈:976 (form-path 500 returning the raw internal message) is a defect and is fixed in T-567**: the body becomes the route's generic `Generation failed` shape, the message logged server-side only. If that line is outside Mahak's claim, Priya extends it for that one hunk.

Tests: error events never carry `inkReleased: true` in v1 (assertion over all emitters); the 976 path returns the generic body; the web shows the Ink line only on `true`.
