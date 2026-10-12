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

### Final scoping (Arjun, 12 Oct 2026, after checking the code)

The mechanism above stands. Re-checked on `develop_staging`: `spendInk` is still called after the run at `documents.routes.ts` l.602, l.1072 and l.1278, and no `inkHolds` exists yet. T-197 has merged (d74d063), so the file-overlap wait is over. Build can start once Priya assigns a lead.

**Tightened acceptance criteria (add to the six above)**
- 7. `settleInk` takes an optional `actualUnits`. If it is below the hold, the difference is returned in the same write. T-202 (charge by paragraph) will hold the shown estimate and settle the actual, so its "never more than the estimate" rule needs no second mechanism. Today `actualUnits` is always the hold.
- 8. `spendInk`'s unawaited `insertMany` and `$unset` (Priya's note below) are awaited inside `settleInk`. A ledger write that fails is logged at error level and picked up by the sweep.
- 9. `holdInk` and `releaseInk` are the only code that touches `inkHolds`. Billing renewal and cancel stay untouched (test: a renewal while a hold is open leaves the hold in place).

**Files and services touched**
- `apps/drafting`: `services/credits.service.ts`, `models/User.model.ts` (`inkHolds`), `middleware/enforceCredits.ts` (shared 402 body helper only), `routes/documents.routes.ts` (the three paths and `withInkHold`), a 5-minute sweep started where the drafting service boots.
- Not touched: `apps/billing`, `packages/shared`, `apps/gateway`, `apps/web`. The 402 body is unchanged, so the web needs nothing. The 409 reuses the web's existing generic draft error; no new copy.
- Hot path: `ai.service.ts` is not touched. The `AbortSignal` is passed only where the pipeline already accepts one; if it does not, release on disconnect without aborting, and say so in the report.

**Gates**
- Founder login: none. Ajay: none (no legal text). Rajesh: none. Vikram: heads-up only, no pricing change.
- Anushka's end-to-end check on develop before prod (CLAUDE.md rule). She should open the same draft in two tabs at once and see one draft and one refusal.

**Build order**
1. `inkHolds` field plus `holdInk`, `settleInk`, `releaseInk`, `releaseExpiredHolds` with unit tests (parallel, release, duplicate, sweep).
2. `insufficientInkBody` helper shared with `enforceCredits`.
3. `withInkHold` wrapper, then switch the template path, the brief path (both kinds), then legacy. One commit each.
4. Disconnect handling and the sweep job.
5. Add the "zero open holds before the drops migration" line to T-201.

## Added (Priya, 12 Oct 2026, from vishal)

- In `credits.service.ts`, `spendInk` does two writes it doesn't await: the inkledger `insertMany` and the user `$unset`. Await them, or make them part of the hold-and-settle flow.

## Arjun (12 Oct 2026): duplicate ledger rows on settle (Mahak, reviewer round 1)

Prod runs **one** drafting instance (`ecosystem.config.js`: pm2 fork mode, `instances: 1` for every app). So today there are no two sweeps. Decision for the code anyway, with no migration and no Redis lock: **only the caller whose `$pull` of the hold actually removed it may write the `generate` ledger rows.** `settleInk` does the `findOneAndUpdate` that requires the hold to be present and reads the removed hold back (`returnDocument: 'before'`); a null result means another settle won, and this call returns without writing anything. The ledger rows are then written from the removed hold's stored split. Two sweeps (or a sweep and a normal settle) can therefore never both insert. Residual risk, accepted: a crash between the `$pull` and the insert loses that run's ledger rows; it is logged at error level with the run id. Add a test: two concurrent `settleInk` calls for one hold produce one set of rows. No unique index on `inkledger` and no billing change; revisit only if drafting ever runs more than one instance.

## Arjun (12 Oct 2026): a hold that expires while its draft is still running (round 2)

**Ruling: a live run keeps its own hold alive. The sweep only ever sees holds whose owner has stopped.** Raising the TTL again is not the fix: any fixed number loses to a slow enough run.

1. **Heartbeat.** `withInkHold` starts a timer when the hold is taken, every 5 minutes. Each beat is one write on the user document: `$set` `inkHolds.$[h].expiresAt` to now + 30 minutes, with `arrayFilters` on `(runId, runSequence)`, only if the hold is still there. The timer is cleared in a `finally`, on response close, and before settle or release. Beats stop after 60 minutes from the hold: past that the run is treated as dead (it is far above any real run, and a hard stop keeps a stuck run from holding Ink forever).
2. **Sweep rule is unchanged** (settle if a completed `Generation` exists for the run, else release), but it now only reaches holds whose heartbeat stopped: a crashed process, a deploy mid-run, or a run past 60 minutes. A hold of a running request is never expired.
3. **Lost hold at settle.** If `settleInk` finds no hold (the sweep got there first because the beat failed or the process stalled past the TTL), do not deliver unpaid: call `holdInk` once more for the same cost. If it succeeds, settle that. If it is refused (the balance was spent in between), send the error event with the same 402 text, send no `done`, and log at error level with the run id. The document, if already saved, stays in the user's history: one free draft in a case that needs a stall longer than 30 minutes **and** the balance emptied in the same window. Accepted; no further machinery.
4. **A failed beat** (database error) is logged at warn level and tried again at the next beat. Two failed beats in a row, release nothing and keep going: the hold's own 30 minutes still covers it.
5. **Tests (fake timers).** (a) A run of 45 minutes with a 30-minute TTL: the hold is extended at each beat, a sweep tick at 35 minutes does not touch it, settle at 45 minutes writes one set of rows. (b) Kill the request without cleanup (timer never fires again): after the TTL the sweep settles or releases it as before. (c) Timer cleared on `done`, on error and on disconnect (no beat after, no leaked interval). (d) Hold removed while the run is alive: settle re-holds once; with a spent balance it sends the error event, no `done`. (e) Past 60 minutes beats stop and the sweep may release.

Files: `credits.service.ts` (a small `extendInkHold`), the `withInkHold` wrapper, tests. Nothing new outside T-226's claim. Uses its own timer, separate from T-285's SSE keep-alive.

**Addendum (Arjun, 12 Oct 2026): Mahak's compare-and-set fix is approved and stays alongside the heartbeat.** The sweep's `releaseInk` matches the hold with an `$elemMatch` on `(runId, runSequence)` and `deliver: { $ne: true }`, in the same write that pulls it, so a hold the route has just marked delivered can never be refunded. On a miss the sweep re-reads: hold present with `deliver: true` means call `settleInk` (idempotent); hold absent means someone else finished it, do nothing. Route-side releases are unchanged. Add a test that interleaves the two: route marks `deliver: true` between the sweep's read and its release, and the user ends charged once with one set of ledger rows.

**Addendum 2 (Arjun, 12 Oct 2026, round 3): both of Mahak's points approved.**
1. `User.inkSettled[{runId, runSequence, settledAt}]`, capped at 50 newest, pushed in the same write as the winning settle's `$pull`. Rule for a missing hold at settle: if `(runId, runSequence)` is in `inkSettled`, the run is already paid: do nothing, send `done`, and do not re-hold. Only when it is in neither the holds nor `inkSettled` does the single re-hold apply. Billing renewal and cancel must not touch the field (add it to the AC9 test). T-115c's account erase needs no change (the field lives on the user record, which is tombstoned).
2. The sweep's release match adds `expiresAt: { $lte: now }`. On a miss the sweep re-reads: present and delivered means `settleInk`; present and not expired (a late beat) means leave it; absent means nothing. Add a test where a beat lands between the sweep's read and its release: the hold survives.

**Addendum 3 (Arjun, 12 Oct 2026): reviewer's medium finding, option (a) accepted now.** If the re-hold at settle throws (a database error, not a refusal), `done` is still sent for an unpaid draft. It needs a lost hold **and** a database fault in the same run, so at most one free draft; logged at error level with the run id. Accepted for this merge so it does not cost a fourth review round. **Follow-up (small, drafting only, Priya to ticket):** treat a throw from the re-hold like a refusal: send the error event, no `done`, same log line, plus a test that forces the throw. The AC4 wording ("no path delivers a draft without a successful charge or hold") has these two documented exceptions until the follow-up merges.
