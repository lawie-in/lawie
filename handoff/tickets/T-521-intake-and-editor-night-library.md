# T-521: Intake, editor and draft-ready in Night Library

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Rajesh (spec sections 04 and 05), a web lead (build) |
| Mode   | Full chain (web) |
| Status | In build: Kunal (21 Oct 2026). Priya |
| Source | T-511 part B; spec `handoff/design/T-511-night-library-spec.md` sections 04 and 05 |

## Scope
Restyle the describe-first intake (T-005 flow unchanged), the documents list, the editor and the draft-ready view on the T-511a components. No behaviour change to drafting.

## Acceptance criteria
1. Every step of the flow shows the specified loading, error and empty states, with the user's text kept on error.
2. Draft ready shows the Ink-used chip and the checks count, with Finalise, Regenerate (confirm dialog) and Export.
3. "The draft did not finish. You were not charged." appears only when that is true.
4. 360px first; reduced-motion; copy only from the signed copy file.
5. Existing intake and editor tests keep passing; new tests for the new states; browser check recorded.

## Arjun (21 Oct 2026) — "No Ink was used" is not true on every failure

Checked `withInkHold` in `apps/drafting/src/routes/documents.routes.ts`.

- **Server-side failure before `done`** (model error, timeout, pipeline throw, GenerationFailedError): yes, released. `release()` runs before the SSE `error` event and the `finally` catches anything that escapes. Show the line.
- **Client-side abort or disconnect** (user navigates away, tab closed, network drop): **not guaranteed.** The pipeline takes no AbortSignal, so the server keeps running. When the run ends, `finish()` settles if the document was **saved**, even with the client gone (the charge rule: Ink is kept when the draft reached the user or was saved). So a dropped connection can end charged, with the draft in the user's list. The web gets no `error` event on this path — it only knows its own stream ended. **Hide the line there.** Say "The connection was lost. Check your documents; if the draft is there, it was charged." or nothing.
- **`error` with `code: 'insufficient_ink'`** (lost hold, re-hold refused): no charge, but the server's own reason text is the right message; don't append the Ink line.
- **`releaseInk` throws** on a server failure: the hold stays until the sweep releases it (TTL). Not charged, but the balance is not back instantly. The line stays true; the balance figure may lag a few minutes.

Rule for T-521: show the line only when the web received a server `error` event whose code is not `insufficient_ink`. Never on a stream that ended without an event.
