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

## Arjun (12 Oct 2026): first short design (superseded where the revision below says so)

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

> **Revised below (Arjun, 12 Oct 2026, later).** Kept: app-level encryption with `formInputsEnc`, dual-read then backfill, ledger covered, web split out, build after T-226. **Changed:** (1) a deleted document and a closed account are erased **at once**, not blanked and purged after 30 days, so there is no soft-delete stage and no daily purge job; (2) each service erases what it owns through `POST /internal/erase-user`, with auth orchestrating, instead of one `erase.service.ts` in drafting reaching into auth and billing collections; (3) billing rows follow Ajay's signed runbook decisions (6941007), not "kept, pending Ajay"; (4) the ledger is encrypted per version (`versions[].factsEnc`), because `facts` lives inside each appended version; (5) the backfill is `encrypt-case-details.ts` and, from this note, also checks `decrypt(encrypt(x))` equals `x` before the `$unset`. Where the two notes disagree, the revision wins.

## Arjun (12 Oct 2026, later): revised design

Read-only survey of `apps/drafting` (Document, FactLedger, FactDiff, Generation, LlmAuxCall, ReviewFeedback models; `documents.routes.ts`; `utils/encryption.ts`), `apps/auth`, `apps/billing`, the gateway proxy and `T-235-erase-runbook.md`. Nothing run. No ADR: no stack change, same `encrypt()`, same internal-secret calls that auth already makes to drafting.

**Assumptions:** auth, drafting and billing share one Mongo database (the runbook's precondition 4; the lead confirms from the three `MONGO_URI`s). Atlas M0 has no backups, so "removed for good" is real the moment the delete runs. **Risk:** one `ENCRYPTION_KEY` with no key id in the ciphertext, so losing the key loses every draft. See the founder list.

### What the code showed (adds to the Context above)

- Plain-text case details sit in **two** places, not one: `Document.formInputs` and `FactLedger.versions[].facts` / `unresolved` (party names, FIR numbers, the advocate's own words). Ajay's T-235 note already says both. The AC only names `formInputs`; this design covers both.
- Already encrypted and fine: `generatedContent`, `finalContent`, `brief`, `FactDiff.ledgerValue` / `draftValue`.
- Stays plain by design: `title`, `courtName`, `sectionsCited` (the list and search need them), `ReviewFeedback.comments` (reviewer free text; deleted with the document). Ajay words the policy to say exactly this.
- Nothing queries inside `formInputs` or `facts`: readers are `documents.routes.ts` (≈ l.1589) and `annexures.service.ts`; the ledger is read only in `fact-ledger.service.ts`. So encrypting them breaks no query.
- Document children that carry content or a link: `FactDiff` (`documentId`, `ledgerId`), `ReviewToken` / `ReviewFeedback` (`documentId`), `Generation` (`documentId`, `intakeId`; numbers and ids only), `FactLedger` and `LlmAuxCall` (by `intakeId`).

### Decisions

| # | Question | Decision |
| - | -------- | -------- |
| 1 | Delete a document: soft or hard? | **Hard delete at once.** No 30-day soft stage, no purge job, no restore. There are no backups to restore from, and "within 30 days" is met by "now". The web asks for a confirm before it calls. |
| 2 | Close an account: grace period? | **No grace.** On confirm the account is locked and erased in one run, which finishes in minutes. A 30-day wait would need a restore path and a purge job for a rare action. Re-registering later makes a new account. |
| 3 | Who is allowed to close? | The signed-in owner only, re-proving it: password users send their current password; Google-only users type their email and must have a session younger than 15 minutes (`Session.createdAt`). A founder erase for another person stays the runbook, not this route. |
| 4 | Active paid plan | Refuse with 409 `subscription_active` and show "Cancel your plan first". If no cancel path exists in billing by the time this builds, the screen says "Write to contact@lawie.in to cancel" and the founder runs the runbook, as `T-235-erase-runbook.md` step 0d says today. Do not build a Razorpay cancel here. |
| 5 | Encrypting `formInputs` | New field `formInputsEnc` = `encrypt(JSON.stringify(inputs))`; `formInputs` is left unset on new writes. One helper `readFormInputs(doc)` returns `formInputsEnc` decrypted, else the legacy plain `formInputs`. Every reader uses it. |
| 6 | Encrypting the Fact Ledger | Per version: `factsEnc` = `encrypt(JSON.stringify({ facts, unresolved }))`; `versions` stays append-only with `$push`. `sealVersion` / `openVersion` live only in `fact-ledger.service.ts`, so no other file sees the change. |
| 7 | Old rows | Backfill script `apps/drafting/src/scripts/encrypt-case-details.ts`: dry run prints counts, idempotent (skips rows that already have `…Enc`), batches of 200, checks that `decrypt(encrypt(x))` equals `x` and `$unset`s the plain field only after the encrypted write succeeded. Run on develop, then production (founder). A later one-line ticket removes the legacy read once both are clean. |
| 8 | Key | Same `ENCRYPTION_KEY`, same `encrypt()`. No rotation in v1 (out of scope). |
| 9 | Atlas storage encryption | Not relied on and not claimed. App-level AES-256-GCM makes "case details are encrypted" true on its own, so Ajay words the policy on that and the AC's second option (confirm storage encryption and reword) is not used. |
| 10 | Where the erase lives | **Each service erases what it owns**; auth orchestrates. Drafting and billing each get `POST /internal/erase-user` (internal secret, never through the gateway), body `{ userId, dryRun }`, returning counts. Both are idempotent. No cross-app imports; no change to `packages/shared`. |
| 11 | Document delete and children | `DELETE /documents/:id` (owner only, 404 otherwise) removes the document, its `ReviewToken` and `ReviewFeedback`, its `FactDiff` rows, and the `FactLedger` and `LlmAuxCall` rows reached through `Generation.intakeId` / `FactDiff.ledgerId`. `Generation`, `UsageLog`, `TemplateUsage` stay (ids and numbers only, needed for cost and margins) with `documentId` unset. Ink already spent is not refunded. |
| 12 | Email jobs | Failed BullMQ jobs are kept 30 days (T-220), which is inside the policy's 30-day promise. Ajay's text says so. No purge-by-recipient in v1. If the jobs carry the address, the erase script lists them in its dry run and does not delete. |

### Account close, in order (auth orchestrates; every step idempotent)

1. Auth: check password or session age (decision 3) and the subscription (decision 4). Set `erasure: { requestedAt, stage: 'locked' }`, `isActive: false`. Delete the Redis `session:<id>:*` and `session:refresh:<id>:*` keys and the user's `Session` rows (existing `deleteAllUserSessions`). The user is logged out at once.
2. Auth → drafting `POST /internal/erase-user`: runbook 2a–2l (reviewfeedbacks, reviewtokens, factdiffs, factledgers, generations, llmauxcalls, documents including `isDeleted` rows, usagelogs, events, templateusages, section bookmarks and recents, bonuscredits) plus Redis `intake:*` keys for that user's intake ids and `intake:burst` / `intake:day`. The `intake:cache:*` entries are encrypted with a 30-minute TTL and are left to expire.
3. Auth → billing `POST /internal/erase-user`: delete `couponusages` (Ajay: delete); delete `inkledger` usage rows, keep payment and top-up rows; blank `reference` on `creditledgers` usage rows; keep `subscriptions` (ids only). Ajay signed this in the runbook (6941007).
4. Auth: strip `auditlogs` to userId, type and time, keeping `payment` and `account_delete`, and write an `account_delete` event; tombstone the user (`$unset` email, name, phone, googleId, password, barCouncilId, enrollmentNumber, state, practiceAreas, passwordResetToken, referredVia; `$set` `isActive: false`, `erasedAt`). **No hash or copy of the email is kept.** Set `stage: 'done'`.
5. A failed step leaves `stage` where it stopped and the user locked. A 10-minute sweep in auth, plus `scripts/erase-user.ts --resume`, retries from that stage. Logs hold the userId and the counts, never the email or a value.

`apps/auth/src/scripts/erase-user.ts <userId> [--dry-run] [--resume]` is the repeatable erase the runbook says is missing. It calls the same code as the route, prints counts per collection, and refuses the founder's own account and the golden-set fixture user. The runbook's step 5 (Sentry by hand, Razorpay cancel by hand) stays manual and is printed as a checklist at the end.

### Slices (Priya makes the tickets; build order)

| Slice | What | Services and files | Gates |
| ----- | ---- | ------------------ | ----- |
| **T-115a** | Encrypt case details: `formInputsEnc`, ledger `factsEnc`, `readFormInputs`, backfill script | `apps/drafting`: `models/Document.model.ts`, `models/FactLedger.model.ts`, `services/fact-ledger.service.ts`, `services/annexures.service.ts`, `routes/documents.routes.ts` (the two write sites ≈ l.554 and ≈ l.1235 and the read ≈ l.1589), new `utils/case-details.ts`, new `scripts/encrypt-case-details.ts`, tests | Not a legal-content path. Starts after T-226 merges (both hold `documents.routes.ts`). Ajay: the policy wording, via T-235 |
| **T-115b** | Delete a document | `apps/drafting` `routes/documents.routes.ts` + a `services/document-erase.service.ts`; `apps/web` delete button and confirm | Rajesh's design for the button and the confirm. Needs T-115a only if the lead wants one pass over `documents.routes.ts`; otherwise independent |
| **T-115c** | Close an account and `erase-user.ts` | `apps/auth` (route, service, script, sweep), `apps/drafting` and `apps/billing` `internal.routes.ts` + an erase service each, `apps/web` account page | Rajesh's design, Ajay's confirm text. Needs T-220 only for an optional confirmation email (not in this ticket). Not before T-234 (it also edits the auth/web account area; the lead checks the overlap) |

Do b and c on separate leads only if the file claims do not overlap; `documents.routes.ts` is the hot file.

### Tests (all three slices)

- a: a new document and a new ledger hold no plain case details in the stored row (read the raw document); an old plain row still reads; after the backfill an old row reads the same and its plain field is gone; running the backfill twice changes nothing; wrong key fails loudly, never returns garbage.
- b: another user's id gets 404 and deletes nothing; the document and every child in decision 11 are gone; `Generation` rows stay with `documentId` unset; a second delete is 404.
- c: password wrong → 401 and nothing changes; subscription active → 409; full run leaves no row with the user's id in the erased collections and keeps the billing rows in decision 10; tombstone has no email; kill the run after step 2 and `--resume` finishes it; dry run changes nothing and prints the same counts as the real run; fixture and founder accounts refused.

### Founder login or physical tasks

1. **Before any backfill: back up `ENCRYPTION_KEY`** from the server's `.env.production` into the password manager, offline copy. If the key is lost, every draft is unreadable and there are no database backups to help. This is the one irreversible risk in this design.
2. Run `encrypt-case-details.ts --dry-run`, then for real, on the production database (founder-only; develop first by the lead).
3. Confirm the Atlas tier. Not needed for T-115 now (decision 9), but Ajay's T-235 list has it.
4. Cancel a paying user's Razorpay plan in the dashboard before an account close, until a cancel path exists.

### Ajay

Policy lines for T-235 and the account screen: the list of what is encrypted (drafts, briefs, case details) and what is not (document titles, court names, reviewer comments), failed email jobs kept up to 30 days, close-account confirm text, and that deletion is immediate and cannot be undone.

### Out of scope

Key rotation; per-field search over encrypted data; deleting from Sentry, Razorpay, Anthropic or SES (runbook step 5); email-job purge by recipient; backups.

**Open question for Ajay (not blocking the build of a or b):** is "erased at once, no recovery" acceptable against the 30-day wording in his T-302 table, since it is faster than promised? Arjun's view: yes, and the policy should say "immediately".

## Arjun (12 Oct 2026): T-115a addendum, `filingChecklist` is a case detail too

Mahak's tester found that `Document.filingChecklist` holds lines built from the inputs ("Certified copy of FIR No. 124/2026"). I missed it in decisions 5 and 6. **Decision: encrypt it in T-115a**, not a separate ticket and not "plain by design": it names a case number, and leaving it plain would keep the policy sentence "case details are encrypted" false. Same pattern: new field `filingChecklistEnc` = `encrypt(JSON.stringify(lines))`, the plain field left unset on new writes, one `readFilingChecklist(doc)` helper used by every reader (the document list, detail and export paths), and the same backfill script covers it with the same decrypt check before the `$unset`. The API response shape does not change. `checklistState` (booleans) stays plain. Tests as for `formInputs`: new row holds no plain lines, old plain row still reads, backfill twice changes nothing.

Still plain by design, as decided: `title`, `courtName`, `sectionsCited`. Mahak: before you close the ticket, list every other `Document` field and every field the ticket's writers copy out of the inputs (including `FactDiff.label` and any `Event.metadata`) and say in the report which hold input text; if one does, tell me before adding it.

## Arjun (12 Oct 2026): audit of the remaining plain fields (Mahak's list)

None of these go into T-115a.
1. **`Document.title` and `courtName`: plain by design, unchanged.** The list screen, search and sort need them. A title can hold names the user typed or the legacy path built. Ajay's policy line says exactly that (titles and court names are not encrypted; do not put client names in a title). Both go with the document or account erase, so nothing is kept after a delete.
2. **`Event.metadata.label` (intake.service.ts ≈ l.798): a defect against Ajay's T-302 rule** ("demand signals: a generic label only, never the user's text"), not an encryption case. No code reads `metadata.label` today (grep found no reader). **New small ticket (Priya to create, say T-115e, drafting only, `intake.service.ts`):** stop writing `label`; keep `category`, `isCourtDocument` and `reason`. If Ajay says the founder needs the free label for demand, then store it only when it matches a closed list and otherwise store `category` alone. The lead checks first what `category` is and reports. Ajay decides whether the label is needed. Events with a user id are already deleted by the account erase, so the old rows leave when a user closes their account; an existing-rows cleanup is a one-line `$unset` in the same ticket, dry run first.
3. **`Event.metadata.assignedTo`: leave.** It is the reviewer's name, typed by the founder or admin who creates the review link, not case input. It goes with the creator's erase (`Event.userId` = the creator).
`FactDiff.label` (config labels only) and `sectionsCited` stay as they are.
