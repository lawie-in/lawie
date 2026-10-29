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
