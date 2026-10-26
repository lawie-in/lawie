# T-596: email-worker /send must refuse userId-only and invoice templates

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (hardening; follow-up to T-587) |
| Owner  | Arjun (design), a lead (build; email-worker) |
| Mode   | Small fix (email-worker only) |
| Status | To do. Raised by Tanvi's T-587 report, 26 Oct 2026. After T-587 merges (same service). Priya |
| Source | Tanvi's T-587 reviewer note |

## Problem
apps/email-worker/src/routes/send.ts (`/send`, behind INTERNAL_SECRET) still renders `auth.welcome` and other userId-only templates from caller-supplied data. A live `/send` of the welcome without `data.streetAddress` would send the placeholder "[street address from config]". No producer calls `/send` for these today, but nothing stops one.

## Acceptance criteria
1. `/send` returns 422 for every UserIdOnlyTemplate and every invoice template: they must go through the queue.
2. Test per class (userId-only, invoice) and one that an addressed template still sends.
3. Email-worker tests and build green.

## Files
apps/email-worker/src/routes/send.ts and its tests. Nothing else. Starts after T-587 merges.
