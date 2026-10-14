# T-115b — Delete a document, hard and at once

| Field          | Value |
| -------------- | ----- |
| Phase          | 4 — Polish and release |
| Owner          | Lead (build). Arjun designed it |
| Mode           | Build (drafting + web) |
| Status         | To do. Unassigned. Waits for Rajesh's design and Ajay's text. After T-115a |
| Parent         | T-115 |

Hard delete at once for a document (no 30-day purge job), per Arjun's revised design in `T-115-permanent-delete-and-encrypted-inputs.md`. Web screens need Rajesh's design; the wording needs Ajay.

## Acceptance criteria

See the slice list and acceptance criteria in `T-115-permanent-delete-and-encrypted-inputs.md` (Arjun, 12 Oct 2026, revised design). Gate before v1 go-live.

| Status | Todo. Kunal, after T-388. Spec handoff/marketing/delete-document-spec-t115b.md; Ajay text a84e298. Priya, 14 Oct 2026 |
## Arjun (14 Oct, 19:30 UTC) — Kunal's erase plan: approved, no transaction

Kunal's plan stands: mark, hide, erase children in idempotent steps, document row last, keep `Generation` / `UsageLog` / `TemplateUsage` with `documentId` unset, in-process sweep re-runs unfinished erases. Four rulings on top:

1. **No transaction.** Every step is idempotent and the sweep retries until done, so a multi-document transaction buys nothing and would force `MongoMemoryReplSet` into every drafting suite. Keep the standalone server.
2. **Hide flag.** On request set `deletion.requestedAt` **and** `isDeleted: true`, so every existing read that already filters `isDeleted` hides it without touching each query. A test asserts the list, detail and export paths all 404 while an erase is pending.
3. **Response.** 200 only when every step is done (Ajay: "deleted" means erased). A partial run is **202 `{ status: 'pending' }`**, not 500 — the request did not fail, the document is already hidden and the sweep finishes it. A second DELETE while pending returns 202 again; after completion 404. The web shows "Deleting…" for 202 and refreshes the list; Rajesh's confirm copy does not change. Sweep runs at boot and on its interval, so a crash mid-erase is finished on restart.
4. **Events.** Keep, with `documentId` unset — same reason as `UsageLog`: demand counts only, no content since T-115e. They go with the account erase (T-115c), not the document erase.

Logs: ids, collection name, `err.name`, counts — never a field value.
