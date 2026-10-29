# T-683 Extractor (role C) — Arjun's answers to Vishal (29 Oct 2026)

Source of truth: `handoff/design/ADR-drafting-v3.md` (roles table, row C; §cost cap; Phase 1 status line). Everything here is behind `feature.drafting_v3_stage` ≥ 1; with the flag off, v2 intake runs unchanged.

## 1. T-682 ledger schema — status

Not merged, schema not yet reviewed. Tanvi sends the schema (TS types, Mongo shape, indexes, invariants) to Arjun **and to Vishal** before she builds. Until it lands, T-683's developer builds against a thin interface it owns and T-682 adopts:

```ts
// apps/drafting/src/services/v3/types.ts  (T-683 owns; T-682 imports and extends)
export interface LedgerCandidate {
  key: string; // checklist/pack key, e.g. 'defendant_name', 'summons_service_date'
  value: string | string[] | number; // normalised by code, never by the model
  type: 'text' | 'date' | 'money' | 'name' | 'choice' | 'list';
  source: { kind: 'description' | 'answer'; turn: number; quote: string }; // quote = exact user words, ≤ 200 chars
  confidence: number; // 0–1 from the model; code treats < 0.6 as "ask"
}
export interface ExtractResult {
  candidates: LedgerCandidate[];
  conflicts: Array<{ key: string; values: LedgerCandidate[] }>; // two dates for one key → a question, never a guess
  nonAnswers: string[]; // keys the user answered with a §(j)3 non-answer → no fact (AJ-655-M1)
}
```

The existing v2 store (`apps/drafting/src/models/FactLedger.model.ts`, `services/fact-ledger.service.ts`) stays untouched by T-683; the Extractor returns `ExtractResult` and the orchestrator (T-685) writes it to T-682's ledger. T-683 ships with the Extractor wired to the current `buildBrief` path behind the flag so it can be exercised before T-685.

## 2. Guards for the per-turn model call

- **Model:** `ai.model.extractor` (AppSetting, per ADR). Migration fallback for one release: `ai.intake_model`. Phase 1 default **claude-haiku-5-5** at `ai.effort.extractor = low`; the ADR's "1 Sonnet per intake turn" is the target once the golden set shows Haiku missing facts — switch by setting, not code. Vikram is told either way.
- **Tokens:** input ≤ 8,000 (description + answers so far + the pack's checklist keys and per-field hints; no prior drafts), `max_tokens` 1,500, structured JSON output; `SYSTEM_CACHE_TTL` 1h on the system block.
- **Per run:** ≤ 6 Extractor calls per run (one per intake turn; a run with more turns re-uses the last result and asks in code). **Per user:** 60 Extractor calls per rolling 24 h, Redis counter, fail-open to v2 (never 503 the user for intake).
- **Failure / timeout (20 s) / cap hit:** that turn falls back to the v2 `extractLines` path; the run is tagged `extractor_degraded: true` on the Generation row and in `llm_call` logs; no retry inside the request (the next turn tries again).
- **Cost:** logged in `llm-usage` with `stage: 'extract'`, counted against the run's `ai.cost_cap_paise_per_ink` budget. **Not Ink-charged** — intake is free today and stays free; Ink is taken at Confirm as now.
- **Concurrency:** one in-flight Extractor call per run (dedupe on runId+turn); shares the existing Anthropic rate limiter.
- **Privacy:** prompt and output never logged; `quote` is stored in the ledger (same custody as today's fact ledger, T-187), never in logs or Sentry.

## 3. Where it lives, what it emits

- New folder `apps/drafting/src/services/v3/`: `extractor.service.ts` (prompt build + call + JSON parse), `validate.ts` (code validation: date parse/range, money, names via the existing non-answer rules, derived keys such as custody-since from arrest date), `types.ts` above. Tests in `apps/drafting/src/__tests__/v3/`. No change to v2 files except the flag branch in `buildBrief`'s caller.
- Prompt file `apps/drafting/src/config/prompts/v3-extractor.ts` — **legal content**: field hints come from Ajay's signed rows (e.g. T-613 row 7 for `restraint_sought`); Ajay signs the prompt once before merge.
- Output: `ExtractResult` only. The Extractor never writes to Mongo, never asks the user, never decides the pack (that's role B).
- Golden set: add 10 cassettes (description → expected candidates) under the existing golden-set harness; T-675/T-679 cases (invented/dropped facts) become the first ones.

Anything not covered here follows the ADR; conflicts between this file and the ADR → ADR wins, tell Arjun.

## 4. Five calls after Vishal's Explore (Arjun, 29 Oct 2026, 18:35 UTC)

1. **Hints:** additive `extract_hint` on `RulePackFact` (rule-pack.service.ts) and in `temporary_injunction_o39.json` `restraint_sought`, read by `v3/extractor` through rule-pack.service only; `buildChecklist` / `extractLines` untouched. The JSON is legal content: hint text = Ajay's signed T-613 row 7 byte for byte; Ajay byte-checks the diff.
2. **Flag:** numeric stage. New reader in `v3/` — `v3Stage(userId): 0 | 1 | 2 | 3` from AppSetting `feature.drafting_v3_stage` (default 0); per-user override only through the existing fixture mechanism; `isSwitchOn` unchanged; the fixture user is 0 unless the cassette sets a stage.
3. **Timeout:** optional `{ signal?: AbortSignal }` on `callAuxModel` (aux-llm.ts), default undefined, no change for v2 callers; T-683's claim extends to aux-llm.ts and its test.
4. **Turn wiring:** first call in `runBriefIntake`, then one per `POST /intake/brief/update` turn, stage ≥ 1 only. Caps are §2's only (6/run, 60/user/24 h); it does not consume `followUpsPerIntake` or the daily intake quota, but goes through the shared Anthropic limiter like every aux call.
5. **Golden:** `extract: string | string[]` in scripts/golden-set/lib/types.ts + lib/modules.ts (a string = the same reply every turn, back-compat), 10 cassettes, all in T-683. Vishal owns types.ts/modules.ts; Kunal (T-684) owns run.ts model keys; Priya records the split; whoever lands second rebases.
6. **`extractor_degraded`:** until T-685, the `llm_call` log only (stage `extract`, `status: 'degraded'`, reason code). T-685 adds the run-state field; no new field on Generation.model.ts in T-683.

## 5. After the build (Arjun, 29 Oct 2026, 19:15 UTC)

1. **Derivation is T-682's `derive()` alone.** The Extractor emits only facts the user stated (description/answers). `v3/validate.ts` normalises and validates (date parse/range, money, name non-answer rules, type mapping) — **no derived keys**; a model output for a derived key is dropped as `not_on_list` (T-682 invariant 6). §3's "derived keys such as custody-since" is withdrawn.
2. **No shared limiter in Phase 1.** The 60/user/24 h Redis counter (fail-open to v2) plus one in-flight call per run is enough; per-run counts/dedupe in process memory until T-685 is accepted. A shared Anthropic concurrency/rate limiter for all aux calls is a separate ticket, scheduled with T-685 (orchestrator) — Priya posts it.
3. **Default model confirmed: `claude-haiku-5-5`** for `ai.model.extractor` (Vikram's cost run: ₹1.4 → ₹0.07 per turn; v3 at Sonnet would break the ₹3.70/Ink gate). Sonnet remains a setting-only switch after the golden set shows Haiku misses facts.

## 6. Golden-set fixture cap (Arjun, 29 Oct 2026, 19:40 UTC)

Option **(b)**: `maxFixturesDefault` counts only the fixtures of the selected variant/stage, so the 10 v3 cassettes don't count against a v2 `--real` run and a v3 run is capped at its own 10 (set `maxFixturesDefault` per variant: v2 30, v3 10 for now). A real run's cost therefore does not rise by a third; Vikram's nightly spend is unchanged. Not (a) — raising the global cap silently raises the nightly bill; not (c) — a second fixtures folder splits the harness.

## 7. Merge timing (Arjun, 29 Oct 2026, 19:40 UTC)

Hold the merge until phase 2 (intake.service wiring + llm-usage, after Kunal's T-684). No dark-code merge of phase 1: every release in the prod loop carries only crew-passed, signed work, and a half-wired Extractor on develop_staging would ride along into a release. Ajay signs the final `v3-extractor.ts` SHA-256 before merge (two lines pending his accept/strike: the injection guard, the T-671 Latin non-answers). T-683 stays full chain: tester, fresh reviewer, doc-writer. Correction to §5 item 3's "go to tester": tester now, merge later.

## 8. Phase 2 calls (Arjun, 29 Oct 2026, 20:35 UTC)

1. **Effort:** separate key. The v3 Extractor reads `ai.effort.extractor_v3` first, then `ai.effort.extractor`, then MEDIUM. v2 intake keeps reading `ai.effort.extractor` → `ai.effort.intake` → MEDIUM, so setting the v3 key to low never moves v2 (15 Oct ruling: medium for v2 intake stands).
2. **Model default:** founder rule holds — no env/code default. `ai.model.extractor = claude-haiku-5-5` is a setting ops seeds (Nikhil, `seed-setting`) before the stage is raised above 0; with it unset the turn degrades to v2 with `model_unset`, which is the right fail-safe. Add it to the T-585 boot-warning list as required when `feature.drafting_v3_stage ≥ 1`, and to the v1.3 runbook. Vikram is told: no cost change until the stage is raised.
3. **Cost cap:** acceptable to ship T-683 with the 6/run and 60/user/24 h caps only; the per-run cost cap (`ai.cost_cap_paise_per_ink`) is T-685's — the orchestrator owns the run budget. The flag default 0 means nothing spends until ops raises it. Recorded as a T-685 acceptance criterion.
4. **Golden report `extract` lines:** in T-683 scope — Priya extends the claim to `scripts/golden-set/lib/report.ts` (and `LlmStageName`); the Opus A/B needs per-stage lines anyway.

## 9. Stage-1 bridge and non-verbatim candidates (Arjun, 29 Oct 2026, 20:55 UTC)

Option **(b)**: a candidate whose normalised value is not verbatim in the user's text is **not bridged** into the v2 ledger at stage 1; the key stays on v2's normal ask-the-user path until T-682 stores typed values with the quote as provenance. Never (a): the bridge must not teach v2's readExtraction a new write shape in T-682's area. Never (c): "accept raw words reaching the draft" is exactly T-676's failure. Count the unbridged candidates (`bridge_skipped_non_verbatim`) in the llm_call log so we can see how many Hinglish facts wait for T-682; add a golden case with "koi recovery nahi hui" asserting the raw words never reach the ledger or draft at stage 1.
