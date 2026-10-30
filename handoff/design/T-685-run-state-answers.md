# T-685 — resumable run state: Arjun's answers (30 Oct 2026)

Answers to Vishal's ten questions after Explore. Binding for T-685. ADR: `ADR-drafting-v3.md` §4. Where this file and the ADR differ, this file wins for T-685.

## 1. Run key

- **One run document per intake.** The orchestrator (ADR role A) owns the whole run: intake turns, confirm, generate attempts. Key = `intakeId` (what the Extractor and the v3 ledger already use).
- The generate `runId`/`runSequence` from `resolveRun` (documents.routes 373–407) stay exactly as they are: they are the **Ink hold key** and the Generation row key, not the run key. The run doc records every generate attempt under `attempts[]: {runId, runSequence, startedAt, endedAt?, outcome}`. `runSequence` remains the attempt counter within a `runId`; a new `runId` (resolveRun's "completed → new run") is a new attempt list entry too.
- A run doc with no `intakeId` does not exist in Phase 1 (the form path stays v2 at every stage).

## 2. Schema and collection

Model `V3Run`, collection `v3_runs`. Your field list is accepted with these changes:

- Add `attempts[]` (above), `schemaVersion: 1`, `stage` (the v3 stage the run started at; a run never changes stage mid-way), `leaseOwner`, `leaseUntil`.
- `outputs` keyed by step id (§3): `{status: 'done'|'running'|'failed', ledgerVersion, startedAt, endedAt?, usage?, costPaise?, ref?, hash?, sealed?}`.
- **Text is stored sealed, never plain.** Steps whose output is draft text (`draft`, `repair.N`, `render`) store it in `sealed` with the T-115a helper and key, exactly as the T-682 ledger does, so a crash after the draft replays without re-paying for it. Plaintext fields are ids, keys, reasons, counts, timestamps, paise only; copy T-682 condition 5's serialise-and-search test. Cap one run doc's sealed bytes at `LEDGER_V3_MAX_DOC_SEALED_BYTES` (12 MB), one output at 2 MB; over the cap, the step stores `ref` (the Document id, once saved) and no `sealed`.
- `ledgerStore: 'v3'|'v2'` + `ledgerId` (T-682 condition 7): set when the run doc is created; `openLedgerForRun` then reads it instead of preferring v3.
- Retention (T-187 rule, latest addendum in `handoff/legal/T-187-fact-ledger-retention-signed.md`): `expiresAt = last update + 30 days`, TTL index, unset when a Document is saved from the run; hard-deleted by `eraseLedgerData` with the ledger (draft soft-delete, account erasure). Synthetic for fixture users. No new rule needed; it is the same data class as the ledger.
- `costPaiseSoFar`, `capPaise`, `inkQuoted`, `extractorCalls`, `extractorDegraded`, `round`, `status: 'intake'|'confirmed'|'generating'|'delivered'|'failed'|'capped'`, `settled`. Drop `lastExtract`, `holdKey` (the hold key is the latest `attempts[]` entry).

## 3. Phase 1 steps and replay

Step ids (string, fixed order per run; `repair.N` repeats):

| step | what | on resume |
|---|---|---|
| `intake.turn.N` | one intake turn: Extractor + validate + ledger append (already idempotent by ledger version) | never replayed; the ledger version is the state |
| `confirm` | brief confirmed at ledger version V | replay (the version pin) |
| `derive` | code-derived facts into the ledger, source `derived` (ADR principle 3; see §10) | replay if `done` at the same ledger version, else re-run (free, code) |
| `hold` | Ink hold for the attempt | **never replayed**: each attempt takes its own hold (§5) |
| `preflight` | today's preflight | replay from stored output |
| `draft` | Drafter | replay from `sealed` |
| `verify` | fact-verifier + code diff | replay from stored findings |
| `repair.N` | one repair round, N = 1, 2 | replay from `sealed` |
| `render` | final text, annexures | replay from `sealed` |
| `deliver` | save Document, settle Ink, `done` | re-run (idempotent on `ref`) |

Rules: a step with `status: 'done'` replays; a step found `running` (crashed mid-step) **re-runs once at our cost**; the same step found `running` a second time (`reruns >= 1`) fails the run safe: Ink released, `event: error` code `run_failed`, one Sentry event. A `failed` step is terminal for the attempt; a new attempt may re-run it once.

## 4. Where the orchestrator sits, stage numbers

- **New file `apps/drafting/src/services/v3/orchestrator.ts`** (+ `run.model.ts`, `run.service.ts`, `stages.ts` under `services/v3/`). It is called from the generate handler in `documents.routes.ts` *above* `streamGenerateFromBrief`, and it calls into `ai.service.ts` through its existing exports. `ai.service.ts` is a legal file: **no edits** beyond exporting an existing function (T-682 condition 8 pattern). If a step needs a piece of `streamGenerateFromBrief` split out, stop and tell me; do not refactor the legal file.
- Stage meanings (`feature.drafting_v3_stage`): **0** v2; **1** typed ledger + Extractor on intake (T-682/T-683, live now at 0 in prod); **2** the orchestrator owns generate: run doc, resume, cost cap, stage events (T-685); **3** Phase 2 roles (fact-checker Haiku pass, legal reviewer, language) — reserved, nothing reads 3 yet.
- **Retire `ledger.service.ts:90–112`** (`draftingV3Stage`, `isLedgerV3On`, its `DRAFTING_V3_STAGE_SETTING`): re-export from `v3/stage.ts`; `isLedgerV3On(userId)` becomes `(await v3Stage(userId)) >= 1`. One reader, one cache, the fixture override everywhere. Update the T-682 tests that call it; those files are yours in this ticket.

## 5. Resume trigger

- **Same route, same contract.** The client resends `run_id` on the generate route (T-003 §3.8; the web already does on retry). No new endpoint; T-538's `/runs/:runId/stream` comes with T-538.
- `resolveRun` runs unchanged → **new `runSequence`**. The orchestrator then finds the run doc by `intakeId` + `userId`, checks the lease, and replays by §3. It does **not** adopt the previous attempt's hold.
- Before taking the new hold, release the previous attempt's hold: `releaseInk(userId, runId, prevSeq)` where the previous attempt has no `deliver` done. Confirm `releaseInk` is a no-op on a missing hold (the sweep may have got there first); if it is not, make it one in `credits.service.ts` (small, non-legal). This is what makes "no double charge" true: one live hold per run at any moment, model cost paid once per step.
- **Lease, yes, now:** `leaseOwner` (process id + random), `leaseUntil = now + 60 s`, renewed on the existing Ink heartbeat tick, taken with a conditional update (`leaseUntil < now` or same owner). A live lease held by another owner → 409 `Draft already in progress` (the same response the duplicate hold gives). Prod is one pm2 instance today; the lease is for the browser double-submit and for the day it is not one instance.

## 6. "Token expiry" (AC2)

It means the **15-minute JWT** (and any 401 the client meets when it reconnects after the session refresh of T-614/615/619). The server checks auth once at the start of the SSE request and never mid-stream; so expiry shows up as: the stream drops, the client refreshes its token, resends `run_id`, and §5 applies. The hold TTL (30 min), heartbeat (5 min) and the 60-min heartbeat ceiling are unchanged and are the run's outer limit: a run older than 60 min from its first hold fails safe. Provider timeouts are per step and already handled by the step's own guard.

## 7. Cost cap

- `ai.cost_cap_paise_per_ink`: **code default 900** (the ADR says default 900), read through `getAppSetting` with the constant as fallback; listed in `APP_SETTING_KEYS` as **optional** and on the T-585 boot-warning list as an info line only when unset ("using default 900"). Not fail-closed: the default is Vikram's signed number.
- `capPaise = 900 × inkQuoted`, fixed when the hold is taken. **During intake there is no Ink cap**; the Extractor's own caps (6 per run, 60 per user per day) are the intake guard. Intake extract cost is still added to `costPaiseSoFar` so the run's true cost is visible, but it does not count against `capPaise` (the user has not bought anything yet, and the cap is defined on the quote).
- Checked **both ways**: before each model call, `costPaiseSoFar + projected(call) > capPaise` → trip without calling (projected = the call's input estimate + its `max_tokens` at the model's output rate); after each call, actual usage is added and `>= capPaise` → trip before the next step. Paise from USD via the existing `getUsdInrRate()` (`finance.usd_inr`, fallback 85) and the Generation rate table; never a new rate constant.
- **Includes** every model call after the hold: aux, preflight, drafter, verifier, repair rounds, any Extractor call in a re-ask. **Summed across resumes** (it lives in the run doc, not in memory).

## 8. Cap tripped

- SSE `event: error`, `code: 'cost_cap'`, `retryable: false`, `runId`. Message text: the web owns the string (Madhuri/Rajesh, not legal — no Ajay); the server sends a plain English fallback: "This draft needed more work than its Ink covers. Nothing was charged. Please shorten the description or try again later." Ajay is not needed; it names no law.
- Ink **released** (fail safe, ADR §4: no Ink charged). Run `status: 'capped'`; `deliver` never runs.
- Sentry: the orchestrator sends **one** event per run, tags `runId`, `intakeId`, `capPaise`, `costPaiseSoFar`, `step` — ids and paise only, never text.
- Budget: **a resume of the same run gets no fresh budget** (that is the point). A new run (new intake or a new `runId` after `completed`) gets its own cap from its own quote.

## 9. SSE

- T-538 is not built; **T-685 does not build it.** T-685 adds a v3-only `event: stage` with `data: {stage, round?, runId}` — no `pct`, `eta_s`, `label`, `id:` or replay buffer; those stay T-538.
- Stage names (closed list, `services/v3/stages.ts`, **not** `packages/shared` — root config is one lead at a time and T-538 will move it): `intake | preflight | draft | verify | repair | render | done`. `round` only on `repair`. Emit from one function `emitStage(res, stage, round?)` in the orchestrator so T-538 has one place to extend.
- Web: **no change now.** `OneFlow.tsx` (~873–902) ignores unknown event names already; add one test that proves a `stage` event is ignored, nothing else. T-539 (Rajesh) draws it.

## 10. Extractor counters, derive rules

- `extractorCalls` is persisted in the run doc and is the truth; the in-memory `runs` Map in `extractor.service.ts` becomes a cache in front of it (read the doc when the Map has no entry). In-flight dedupe stays in memory plus the §5 lease; do not persist it.
- Deferred derive rules (s. 138 arithmetic, old/new law switch, limitation dates): **orchestrator, step `derive`**, as code, writing ledger entries with `source: 'derived'` before `draft` — never inside generation and never by a model (ADR principle 3). The rule tables they read are legal content where they already are; `derive` only calls them.

## File list

Send me the list after you have read this, before the developer starts: expected NEW `services/v3/{orchestrator,run.model,run.service,stages}.ts` and their tests; `documents.routes.ts` generate handler (the call-out only); `ledger.service.ts` 90–112 retirement + its tests; `extractor.service.ts` counter read-through; `app-settings.service.ts` one optional key; `credits.service.ts` only if `releaseInk` is not a no-op on a missing hold; one web test. `ai.service.ts`: exports only, or stop and ask.

## 11. Cost summing and two file boundaries (Arjun, 30 Oct 2026, after the file list)

- The orchestrator **sums step usage itself** from what each step returns. No hook on `logLlmCall`; no change to `llm-usage.ts` or `run-context.ts`. The cap check belongs in the step's own control flow (§7), not in a best-effort logger.
- `ai.service.ts`: **export or return usage only.** Anything more than a return value or an export of an existing function: stop and ask.
- `resolveRun` (documents.routes 373–407) is **read-only** unless I approve a described change first.

## 12. Part-2 calls (Arjun, 30 Oct 2026)

1. **Lease renewal:** the lease stays 60 s; the orchestrator runs its **own ~20 s renew timer** (conditional update, same owner), started when the lease is taken and stopped wherever the Ink heartbeat timer is stopped (every ending: done, error, cap, release). Do not stretch the lease to 6 min — a 6-min lock after a crash is a 6-min "Draft already in progress" for the user's retry. §5 is corrected accordingly.
2. **Erasure is in T-685, not a follow-up.** Stage 2 must not go on with run docs that outlive the ledger. Add one call each: `document-erase.service.ts` deletes `v3_runs` by `intakeId` next to the ledger delete; `account-erase.service.ts` deletes by `userId`. Hard delete, same transaction/ordering as the ledger, one test per file (run doc gone after each erase). Priya extends the grant to those two files (I have asked her); nothing else in them changes.
3. **Fields confirmed:** `rev` (optimistic version, every write conditional on it), `capBasePaise` (spend at hold time; cap compares `costPaiseSoFar - capBasePaise` against `capPaise`), `documentId`, `runType` (the fixture plugin), and per-output `reruns`, `retries`, `runId`, `runSequence`, `sealedOmitted`, `reason`. Plaintext rule of §2 still applies to all of them (ids, counts, reasons, paise only).
   **New `runId` vs resume:** confirmed. A new `runId` (a new paid run after a `completed` one) clears every non-intake output and resets `capBasePaise`/`capPaise` for the new quote, so it never replays the old draft; `attempts[]` and the intake outputs are kept. A resume (same `runId`, new `runSequence`) keeps all outputs and the cap.

## 13. Part-2 BLOCKED questions (Arjun, 30 Oct 2026) — these amend §3, §4, §9, §10

**Q1 — step boundaries inside `streamGenerateFromBrief`: option (C), narrowly.**
One optional parameter `hooks?: RunHooks` on `streamGenerateFromBrief`, default undefined, with the v2 path byte-identical when absent:
```ts
interface RunHooks {
  /** Before a model call: return stored output to use instead of calling (replay), or undefined to call. May throw CostCapError. */
  before(step: StepId, projected: { inputTokens: number; maxOutputTokens: number; model: string }): Promise<StepReplay | undefined>;
  /** After a model call: usage of that call and the step's output text (the orchestrator seals it). May throw CostCapError. */
  after(step: StepId, usage: CallUsage, output?: string): Promise<void>;
  stage(stage: V3StageName, round?: number): void;
}
```
Rules for the edit: (a) each existing model call site becomes `const r = (await hooks?.before(id, proj)) ?? await <the same call>` followed by `await hooks?.after(id, usage, text)`; on replay the function writes the stored text to `res` exactly where it writes the model's text today; (b) **no prompt string, check, order of checks, threshold or label changes** — the diff is control flow only; (c) `UsageMeter` keeps working as now (the hooks are additive); (d) the four step ids inside the stream are `draft`, `verify`, `repair.N`, `render` — Vishal maps each to its call site and lists the mapping in the developer report; a call site that fits none stops the chain and asks; (e) `CostCapError` thrown from a hook ends the stream through the existing error path (Ink released by `finish`). Ajay checks the final diff of `ai.service.ts` as "no legal text changed" on the merge SHA (as T-683). Option (A) is rejected: a crash in repair would re-pay the draft, which is the one thing AC2 forbids. Option (B) is rejected for this ticket: a split of the legal file is Phase 2 work.

**Q2 — preflight:** the brief route has none; there is **no `preflight` step** on the brief path. Drop it from §3 and from the emitted stages (the enum may keep the name for T-538).

**Q3 — derive:** T-682 invariant 6 holds: **derived values are computed at read, never stored.** There is **no `derive` step** in T-685; s. 138 (`withS138DateChecks` in the route), law switch and limitation stay exactly where they run today. §10's second bullet is withdrawn for Phase 1; moving those into the orchestrator is a Phase 2 ticket with Ajay.

**Q4 — opening the run:** in T-685 the run doc is **opened at generate**, when the first `hold` is taken; intake turns are already recorded as ledger versions and are not copied into the run doc (`intake.turn.N` rows dropped from §3). The extractor read-through is **withdrawn**: `extractor.service.ts` keeps its in-memory state; at open, the orchestrator copies `extractorCalls`/`extractorDegraded` from that state if present (best effort, ids and counts). `extractorDegraded` is true for any degraded turn, with or without a model call, with its reason code.

**Q5 — facts for generation at stage ≥ 2:** when the run's `ledgerStore` is `v3` and a v3 ledger exists for the intake, generation reads `factsForGeneration` (v3); otherwise v2 `currentState` as today. T-682 condition 6 proves the two are byte-equal for the v2 fixtures; add one test that a fixture intake written at stage 1 yields byte-equal facts from both readers, so the draft input does not change by the switch alone.

Grant: `ai.service.ts` is added to Vishal's T-685 files for the hooks parameter only (Priya), with Ajay's diff check at merge.

**Ajay's condition on Q1 (30 Oct 2026, accepted):** a replayed step substitutes the stored *model output* only; every check that ran on the live output (the T-611 gates included) runs again on the replayed output, none skipped. A replay that bypasses a check counts as a legal change and fails his diff check. So `hooks.before` sits exactly at the model call, never around the checks that follow it.

## 14. Part-2 built (d6fef931) — six rulings (Arjun, 30 Oct 2026)

1. **Extractor counts: (b) drop the copy.** `extractorCalls`/`extractorDegraded` stay optional fields, unset in T-685. No export from `extractor.service.ts`.
2. **Fail-safe, relaxed two ways:** (i) a provider-side failure (429, 529, 5xx, timeout, connection reset) does **not** count toward the two re-runs — only a step found `running` (a crash) or a step that threw a non-provider error does; (ii) `retry_exhausted` **expires 15 min** after it was set, after which one more re-run is allowed. Error codes for the provider case stay what the stream sends today.
3. **Stage-2 intake with no v3 ledger runs v2.** Confirmed; no run doc is opened and nothing is recorded.
4. **Approximations:** `inkQuoted = ceil(inkCost), min 1` — yes. `settled = "doc saved and not a duplicate"` — yes, with a code comment that it is derived, not the settle result. **Unpriced model: never 0.** Price it at the **highest rate in the configured table** with one `warn` (ids only); if the table has no rate at all, the cap cannot be enforced, so the run **falls back to v2** for that attempt (fail closed on v3, not on drafting).
5. **Lease renew stops at request end, not on client disconnect** — yes; the run continues server-side exactly as the Ink heartbeat does.
6. **Failed Generation usage = the orchestrator's own call count** on cap/fail-safe — yes; set `usageSource: 'estimated'` on that row.

**`confirm` reset on input-hash change: confirmed.** Under the same `runId`, when the hash of (ledger version, pack id, quote inputs) differs from the stored one, `resetSteps` clears every non-intake output and resets `capBasePaise`/`capPaise`, as the new-`runId` path does (§12.3). An old draft never replays against new facts. Add the test `confirm-hash-change-resets-steps`.
