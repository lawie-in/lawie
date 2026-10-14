# Prompt caching on the drafting path — design (Arjun, 14 Oct 2026)

**Why now:** Vikram's model (14 Oct): uncached ≈ ₹7.50/Ink → first profitable month 12, cash need ≈ ₹7.7L; cached ≈ ₹4/Ink → profitable from month 9, cash need ≈ ₹5.2L. Biggest lever we have, so it ships before launch and Anushka's run measures the cached number.

**Scope:** `apps/drafting` only — `services/ai.service.ts` (draft call, D1 structured-output call), `services/preflight.service.ts`, `services/aux-llm.ts` if any prompt there is static and > 2k tokens. No new dependency, no ADR (same API, one request field). Small-fix mode is wrong: it touches the money path → full chain.

## Decisions

1. **What is cached.** Everything that is the same for every request on the same pack: the system prompt (`drafter.prompts.ts` text), the rule pack JSON, the skeleton (D1) and the clause tables. The request order is already `tools → system → messages`; put the static text in `system` as blocks, the last static block carrying `cache_control`, and keep every per-request value (facts, ledger, user inputs, dates) in `messages` after it. One breakpoint per call is enough; never more than 4.
2. **TTL 1 hour**, not the 5-minute default: `cache_control: { type: 'ephemeral', ttl: '1h' }`. Our traffic at launch is a few drafts an hour spread over ~20 packs; a 5-minute cache would miss most of the time. 1h write costs 2× input once per pack per hour; reads cost 0.1×. At 10+ drafts/hour the hit rate on a pack prompt is 60–80%.
3. **Nothing per user is cached.** Case details never go in the cached prefix — they are per request and under the breakpoint. (Caching is per-org on Anthropic's side anyway, but the prefix must not carry one user's facts into another user's cache key.)
4. **Determinism.** The lead checks the static blocks are byte-identical between requests: no timestamps, no request ids, no `JSON.stringify` of objects with varying key order, no user name in the system prompt. A test renders the system blocks twice for two different users on the same pack and asserts equality.
5. **Measurement.** `Generation` and `LlmAuxCall` already have the fields for cache tokens via T-003's rate reader (`cache_write_usd_per_mtok`, `cache_read_usd_per_mtok`); the lead confirms `usage.cache_read_input_tokens` and `cache_creation_input_tokens` are stored per call and priced, and adds them to the admin cost screen. Acceptance: on develop, the second draft on the same pack within an hour shows `cache_read_input_tokens > 0` and a lower `costUsd` than the first.
6. **Admin rates.** The four-number rate JSON (input, output, cache write, cache read) — the values the founder is entering today already include the cache fields.
7. **Model.** Unchanged (Sonnet 4.6 class). Sonnet 5.5 at $2/$10 is a separate decision after Anushka's quality run, not bundled here.

## Free tier (Vikram's second question)

Intake is already on Haiku for everyone (`ai.intake_model`). Preflight stays on one model for all tiers: a per-tier model switch is a second quality surface Ajay and Anushka would have to sign off twice, and it would make the free trial draft different from the paid one — the thing the trial is supposed to sell. The free-tier cost lever is the same caching (same pack prompts). ₹22 per sign-up stands and drops with it.

## Acceptance criteria (for Priya's ticket)

1. Draft, D1 and preflight calls send the static prefix as `system` blocks with one `cache_control` (1h) on the last static block; per-request content is in `messages`.
2. Two renders of the static blocks for different users on the same pack are byte-identical (test).
3. `cache_read_input_tokens` / `cache_creation_input_tokens` are stored per call, priced with the cache rates, shown in the admin cost screen.
4. On develop: second draft on a pack within an hour has `cache_read_input_tokens > 0` and lower `costUsd`; the lead reports both numbers.
5. Golden set unchanged (recorded replies); real-model run unaffected.
