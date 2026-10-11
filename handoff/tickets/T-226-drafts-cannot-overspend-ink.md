# T-226 — A user cannot draft past their balance

| Field          | Value |
| -------------- | ----- |
| Phase          | 0 — Prep |
| Owner          | Arjun (mechanism: hold before, settle after), Vikram (heads-up), Lead (build), Anushka (verdict) |
| Mode           | Arjun's call first, then build, full chain (drafting, billing) |
| Status         | To do. Waits for Arjun's mechanism. Build after T-197 merges (it holds documents.routes.ts) |
| Size           | M (1 day) |
| Depends on     | T-197 (file overlap) |
| Gate           | Before v1 go-live (T-403) and before paid launch |
| Branch         | fix/t-226-no-overspend |
| Legal sign-off | Not needed |
| Created        | 2026-10-11 |
| Source         | Vikram, while costing T-223, 11 Oct 2026. Priya checked the code |

## Problem

`apps/drafting/src/middleware/enforceCredits.ts` checks the balance before a draft. `apps/drafting/src/routes/documents.routes.ts` charges with `spendInk` only after the draft is done (three places: template, guided, legacy). If the charge fails, it is only logged and the draft is still delivered. So a user who sends several drafts at once gets them all on a balance that covers one, including free Ink.

## Acceptance criteria

1. Arjun picks the mechanism (for example, hold the cost atomically before the run and settle or release it after) and writes it here.
2. With a balance for one draft, N parallel requests give exactly one draft; the others are refused with the same message as an empty balance.
3. A failed or cancelled run releases its hold; the user is not charged.
4. No path delivers a draft without a successful charge or hold. A charge failure after the run is an error the user sees, not a log line.
5. The duplicate-attempt rule (one charge for one logical draft) still holds.
6. Tests cover parallel requests, failure release and the duplicate attempt, for all three generate paths.

## Out of scope

- Drops pricing itself (T-201 to T-205)
- Email verification (T-223)

## References

- T-223 (Vikram's note), T-152, ADR-020

## Arjun (12 Oct 2026)

AC1 decision: **debit-on-hold on the user document.** One atomic `findOneAndUpdate` takes the Ink and records the hold in the same write, before any model call. After the run the hold is settled (kept) or released (refunded). No transactions, no new collection.

**Assumptions:** Ink lives only in `inkSub`, `inkAnnualCarry` and `inkTopup` on `User`. Drafting's Jest DB is a standalone `MongoMemoryServer`, so it has no multi-document transactions. Only a single-document write is atomic in both test and prod, and that is why the hold lives on `User`.
**Risk:** a hold that is never closed (crash, deploy mid-run) keeps the user's Ink. The expiry sweep below covers it.

### Mechanism

| Step | Where | What |
| --- | --- | --- |
| 0. Pre-check | `enforceCredits` (unchanged) | Stays as a quick early 402. Not trusted for correctness. |
| 1. Hold | Route handler, after validation, 403/404 and `resolveRun`, before the first byte is streamed | `holdInk({ userId, costCredits, runId, runSequence })`. One pipeline `findOneAndUpdate` on `User` with the guard `total >= costUnits` AND `inkHolds` has no entry for `(runId, runSequence)`. It takes the units in today's bucket order (`spendInk`'s pipeline) and pushes `{ runId, runSequence, units, split: {sub, carry, topup}, unit: 'ink2', expiresAt: now + 15 min }` onto `inkHolds`. Same write, so the guard and the debit cannot race. |
| 1a. Hold refused, no Ink | Handler | 402 with the **same body as `enforceCredits`** (extract one `insufficientInkBody(cost, balance)` helper and use it from both). No model call. |
| 1b. Hold refused, duplicate | Handler | Re-read: if an `inkHolds` entry for `(runId, runSequence)` exists, return 409 `{ error: 'Draft already in progress', runId }`. No model call, no charge. |
| 2. Settle | After a successful run, if the document was saved **or** the client is still connected | `settleInk(userId, runId, runSequence)`: `$pull` the hold (the filter requires it to be there, so it is idempotent), then write today's `inkledger` `generate` rows from the stored split. Then send `done`. |
| 3. Release | Any other ending | `releaseInk(...)`: one `findOneAndUpdate` that requires the hold to be there, `$pull`s it and `$inc`s each bucket back by its split. Idempotent. No ledger row. |
| 4. Expiry sweep | Start of every `holdInk` for that user + a 5-min job | For each expired hold: settle if a `completed` `Generation` exists for `(runId, runSequence)`, else release. This also repairs a settle that failed. |

The fixture user (T-147e) skips 1 to 4, as `spendInk` does today. The free-tier safety counter is unchanged.

### Charge rule (one line)

Ink is kept only when a successful run's draft reached the user: the stream finished, or the document was saved to their history. Every other ending returns the Ink.

### Endings

| Case | Outcome |
| --- | --- |
| N parallel requests, balance for 1 | One hold wins. The others get 1a (same message as an empty balance). Covers AC2. |
| `GenerationFailedError` / other throw in the pipeline | Release, then the existing failed `Generation` row and SSE error. Covers AC3. |
| Client disconnects before `done` (cancel) | Add `res.on('close')`. If no `done` has been sent, abort the model call (pass an `AbortSignal` into the pipeline where the SDK allows) and release. If the run still finishes **and** the document saves, settle (the draft is in their history). Covers AC3. |
| Document save fails, client still connected | Settle (the text was delivered on screen). Same as today, but now paid for up front. |
| Document save fails **and** client gone | Release. |
| Settle DB error | The Ink is already debited, so nothing is free. Log at error level. The sweep settles it from the `completed` `Generation`. Not an error shown to the user, because they have paid and have the draft. |
| Concurrent duplicate (same `run_id`, same `runSequence` from `resolveRun`) | Stopped at 1b before any model spend. One charge for one logical draft. Covers AC5. Today the loser streams a full free draft and Anthropic charges us for it; this removes that. |
| `recordGeneration` still returns `duplicate: true` (should no longer happen) | Release this request's hold. Never charge twice. |
| A retry after a completed attempt | `resolveRun` already starts a new run → new key → new hold. Unchanged. |

**AC4 restated:** the user-visible "charge failure" is the hold refusal (402/409), and it comes before any text. After a hold, no path can deliver a draft unpaid, so the post-run `console.error` branches of `spendInk` go away.

### Apply to all three generate paths

`/generate-from-template` (≈ l.399), `/generate-from-brief` (≈ l.710, template and guided kinds) and `/generate` legacy (≈ l.1108). Each one calls `holdInk` right after `resolveRun` and moves the post-run `spendInk` to `settleInk`. Each of its failure branches gets `releaseInk`. Put the three in one wrapper (`withInkHold(req, res, key, cost, run)`) so the paths cannot drift apart.

### Build notes for the lead

- Service: `apps/drafting/src/services/credits.service.ts` (`holdInk`, `settleInk`, `releaseInk`, `releaseExpiredHolds`). Model: add `inkHolds` (array, default `[]`) to the drafting `User` model. Keep `spendInk` exported until nothing calls it.
- The balance API needs no change: held Ink is already off the buckets. Optionally expose `inkHeld` later. Not in this ticket.
- Billing (`ink-ledger.service.ts`): renewal and cancel `$set` the buckets and must not touch `inkHolds`. Accepted edge: a release just after a renewal or cancel returns ≤ 2 Ink to `inkSub`. Do not build around it.
- T-201 (drops): every hold carries `unit: 'ink2'`. The drops migration must run with zero open holds, or convert `units` and `split`. Add that line to T-201 when it is scoped.
- Hold TTL is 15 min. The lead confirms it is above the longest real run (pipeline plus repair pass) and raises it if not.

### Tests (AC6), each for template, brief (rule-pack and guided) and legacy

1. Balance for one draft, 5 parallel requests: exactly 1 `done`, 4 × 402 with the same body as `enforceCredits`, final balance 0, one set of `generate` ledger rows.
2. The model mock throws (`GenerationFailedError` and a plain `Error`): balance restored to the starting value, no `generate` row, `inkHolds` empty.
3. Client aborts mid-stream with a run that does not complete: released. With a run that completes and saves: settled once.
4. Two concurrent requests with the same `run_id` / `runSequence`: one 200 stream, one 409, one model call, one charge.
5. Sweep: an expired hold with a completed `Generation` is settled; one with no `Generation` is released; running the sweep twice changes nothing.
6. Fixture user: no hold, no ledger row (regression).

Decision owner: Arjun. Vikram: no pricing change. Free Ink and paid Ink go through the same guard.

## Added (Priya, 12 Oct 2026, from vishal)

- In `credits.service.ts`, `spendInk` does two writes it doesn't await: the inkledger `insertMany` and the user `$unset`. Await them, or make them part of the hold-and-settle flow.
