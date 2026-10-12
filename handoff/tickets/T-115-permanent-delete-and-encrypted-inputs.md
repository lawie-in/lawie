# T-115 — Permanent delete, and encrypt saved case details

| Field      | Value                                 |
| ---------- | ------------------------------------- |
| Phase      | 4 — Polish and v1                     |
| Owner      | Vishal, Arjun on the design           |
| Mode       | Full chain                            |
| Status     | Needs a short design from Arjun first |
| Depends on | None                                  |
| Branch     | feature/t-115-delete-and-encrypt      |
| Created    | 2026-10-04                            |

## Goal

What the privacy policy promises about deletion and encryption is true in the code.

## Context

- Found in T-302. The policy says users may delete their documents and account, and that case details are encrypted at rest.
- Documents are only flagged `isDeleted`. No route removes a document or an account.
- A document's `formInputs` (party names, FIR numbers, the facts) are saved as plain values. Only `generatedContent` and `finalContent` go through `encrypt()` in `apps/drafting/src/utils/encryption.ts`.
- Whether Atlas encrypts storage on the production tier is not confirmed.

## Acceptance criteria

- A deleted document is removed for good within 30 days of the delete.
- A user can close their account. Their documents and inputs are removed for good within 30 days. Payment records are kept.
- `formInputs` are encrypted with the same method as the draft text, including existing rows, or Arjun confirms storage encryption and Ajay rewords the policy.
- Tests cover: a delete, the purge after 30 days, an account close, and reading an old document after its inputs are encrypted.

## In scope

- `apps/drafting`: document routes, the Document model, a purge job
- `apps/auth`: account close

## Out of scope

- Backups of deleted data (there are none on M0)

## References

- Design: Not needed
- ADR: Not needed
- Legal sign-off: Ajay, T-302, 4 Oct 2026

## Note (Priya, 12 Oct 2026)

Ajay: having no in-app delete is a DPDP s.12 risk (T-235 follow-up). Until this ticket ships, the privacy policy promises "erase by request", and Arjun must confirm before go-live that a manual erase can be run.

- Repeatable erase: `scripts/erase-user.ts` with a dry run and counts, following T-235-erase-runbook.md (Arjun, 12 Oct 2026).

## Arjun (12 Oct 2026)

Short design. Checked in code: `formInputs` is a `Mixed` field only written and read by `documents.routes.ts` (l.554, 963, 1235, 1589) and `annexures.service.ts`; nothing queries inside it. `Document.brief` is already encrypted. `FactLedger.facts` ("stored as written") also holds party names and FIR facts in plaintext, so the policy promise needs it too.

**Decisions**
| Item | Decision |
| ---- | -------- |
| Encryption | App-level, same `encrypt()`. New field `formInputsEnc` = `encrypt(JSON.stringify(inputs))`; `formInputs` is unset on write. Same for `FactLedger.facts` -> `factsEnc`. One helper `readFormInputs(doc)` returns the object from either field, so old rows keep working. Do not rely on Atlas storage encryption: tier unconfirmed, and it does not protect against a stolen DB export. |
| Old rows | Dual-read ships first. Then a one-off `apps/drafting/src/scripts/encrypt-inputs.ts`: batches of 200, skips rows that already have the Enc field, `--dry-run` prints counts, verifies decrypt(encrypt(x)) equals x before the `$unset`. Idempotent, safe to re-run. |
| Delete a document | `DELETE /api/documents/:id` (owner only): sets `isDeleted: true`, `deletedAt: now`, unsets `formInputs`/`formInputsEnc`, and blanks `generatedContent` and `finalContent` to a short tombstone at once. A daily purge job hard-deletes rows with `deletedAt` older than 30 days and their children by `documentId` (reviewtokens, reviewfeedbacks, generations, factledgers, factdiffs, llmauxcalls, bookmarks). No undo promise in the UI. |
| Close account | `DELETE /api/auth/me` with password (or Google re-login) confirmation. Refused with a clear message while a subscription is active ("cancel your plan first"), because the code has no Razorpay cancel call. On success: `isActive: false`, `closeRequestedAt`, all sessions killed (Redis `session:*`, `session:refresh:*`). After 30 days the same purge job erases the user's drafting data and tombstones the user record (runbook step 4). Billing rows are kept (T-235 step 3, pending Ajay). |
| One erase path | `apps/drafting/src/services/erase.service.ts` implements steps 2 and 4 of `T-235-erase-runbook.md`. The purge job and `scripts/erase-user.ts` (Priya's note) both call it, with the dry run and counts. Auth and drafting share the database today (runbook precondition 4), so no cross-service call is needed; if that changes, revisit. |

**Assumption:** one shared Mongo database. **Risk:** purge is irreversible and there are no backups; the job logs counts only (never ids with content), runs dry-run on develop first, and skips the founder and fixture users.

**Acceptance criteria added**
- `FactLedger.facts` is encrypted the same way. A test reads a pre-change row and a new row through the same code path.
- The migration is verified on a seeded develop copy before the prod run; counts before/after are in the lead's report.
- Purge never touches billing, subscriptions or ink ledger rows. A test asserts they survive an account close.
- Logs and Sentry hold counts and user ids, never inputs or addresses.

**Files:** `apps/drafting` (Document and FactLedger models, `documents.routes.ts`, `annexures.service.ts`, new `erase.service.ts`, purge job, migration script), `apps/auth` (`auth.routes.ts`, User model fields), `scripts/erase-user.ts`. Web (delete button, close-account screen) is outside the listed scope: Priya to split it into a follow-up ticket after Rajesh's design.

**Gates**
- Founder login (physical): (1) in Atlas, read the production cluster tier and whether encryption at rest is on, and tell Ajay; (2) run `encrypt-inputs.ts` on production, dry run first, after the dual-read code is on `main`; (3) the T-235 manual erase stays the interim path until this ships.
- Ajay: the 30-day wording for delete and account close, the confirmation text, and whether billing rows stay under a pseudonym.
- Rajesh: delete confirmation and close-account screens (web follow-up only).

**Build order** (after T-226 merges: both edit `documents.routes.ts`)
1. Models, `readFormInputs`, dual-read, write-encrypted, tests. 2. Migration script and develop dry run. 3. Document delete route, `erase.service.ts`, purge job. 4. Account close in auth. 5. `scripts/erase-user.ts`. 6. Web follow-up after Rajesh and Ajay.
