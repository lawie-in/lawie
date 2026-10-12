# ADR-024: Judgment summary on user-supplied text (T-286, P0)

| Field | Value |
| --- | --- |
| Status | Proposed. Arjun, 12 Oct 2026. Priya decides for the founder. Ajay's rule and labels, Rajesh's design and Vikram's price still open |
| Ticket | `handoff/tickets/T-286-judgments-p0-summary-of-pasted-judgment.md` |
| Source | `handoff/legal/judgments-scope.md` (Ajay, 641e2ee), feature 1 only |
| Not before | The v1 blockers (Priya's scope call) |

## Facts from the code

- `aux-llm.ts` (`callAuxModel`) is the one small-model helper: the Anthropic SDK directly, streamed, usage read from the provider, model id passed in. `LlmAuxCall` rows hold numbers and ids only.
- `citation-check.ts` (`removeUngivenCitations`, T-148/T-263) already removes case law the advocate did not give.
- There is no PDF text extraction in the repo (only `puppeteer`, for export). T-304 (PDF attach) is blocked on T-301.
- `express.json` limit is 10 MB; nginx at 60 s read timeout (T-285 adds a keep-alive helper).
- ADR-023 puts the assistant in `apps/drafting/src/assistant/` and bans cross-imports. The assistant refuses case law and stays as it is.

## Decisions

| # | Question | Decision |
| - | -------- | -------- |
| 1 | Placement | A module in drafting, `apps/drafting/src/judgments/`, route `POST /judgments/summary`, gateway mount `/api/judgments`. No new service. Same isolation fence as ADR-023: imports none of `ai.service.ts`, `drafter.prompts.ts`, `intake.prompts.ts`, `brief-drafter.ts` and nothing in `assistant/`; nothing outside imports it except `app.ts`. |
| 2 | Input in P0 | **Pasted text only**, 150,000 characters at most (about 40,000 tokens). Longer: refuse with "paste the part you need"; no chunking or map-reduce in P0. **Upload of a text PDF is a later slice (T-286c)** that waits for T-304's choice of extractor. Scanned PDFs and images are refused, no OCR in P0. |
| 3 | Statelessness | **Nothing is stored.** Not the text, not the summary. The response is the only copy; the advocate copies it out. So there is no retention rule, nothing in the erase runbook, and nothing to leak from the database. Mongo gets a numbers-only `judgmentcalls` row per call (ids, tokens, ₹, status, latency). |
| 4 | Model | Haiku 5.5 as the starting point, id in AppSetting `ai.judgments_model`, rate row `ai.rates.<slug>`, thinking disabled, effort set explicitly as in ADR-023 §2. `max_tokens` 3,000, streamed, no tools, no prefill. The lead measures on Ajay's sample (below). If verified-quote coverage is under 85%, raise the model through the setting (no deploy) and Vikram re-costs. Separate API key `ANTHROPIC_JUDGMENTS_API_KEY`; empty means the feature is off. |
| 5 | **Quote, do not paraphrase: enforced by code** | The model returns JSON only. Every item that claims what the judgment says carries `{ para, quote }`. The server (a) splits the text into numbered paragraphs by a deterministic parser (`1.`, `(1)`, `Para 12` markers; text before paragraph 1 is "header"), (b) checks each `quote` appears verbatim in paragraph `para` after normalising whitespace, quotes and dashes, and (c) **drops any item that fails**. Dropped items are counted and shown as "n points could not be verified against the text". The advocate never sees an unverified holding. |
| 6 | Output shape | `issues[]` (short prose, each tied to paragraph numbers whose quotes verify), `holding[]`, `relief[]`, `key_paragraphs[]` (all `{para, quote}`), `header` (court, date, bench, parties) **only if found verbatim** in the header, else "not stated". Prose fields are capped (200 characters each). |
| 7 | No status claims | Prose fields are scanned for `good law`, `overruled`, `binding`, `distinguished`, `followed`, `affirmed`, `reversed`, `per incuriam`; a hit drops the field. The same words are fine inside a verified quote. The code appends "check the current status" itself. |
| 8 | T-148 | The `removeUngivenCitations` check runs over every prose field with "given" = the pasted judgment. Case names inside verified quotes are the judgment's own words and pass. |
| 9 | Labels and disclaimer | The code, not the model, adds "Summary of the text you gave" and `Legal information, not legal advice. Check the judgment before you rely on it.` on every result and every export or copy action. Ajay's final wording replaces these placeholders. |
| 10 | Pasted text is data | Wrapped as `<judgment_text>…</judgment_text>` after stripping tag look-alikes; the prompt says it is a document, never instructions. A judgment that contains "ignore previous instructions" can at worst produce items that fail verification. Output is parsed as JSON against a schema; anything else is an error, not shown. |
| 11 | Logging | Pino and Sentry hold ids, label, status, token counts, ₹ and latency. Never the text, a quote, a party name or the summary. Pino `redact` for `req.body`, `*.text`, `*.summary`. No `console.*` in `judgments/` (ESLint rule scoped to the folder). SDK errors wrapped as `JudgmentError(code)`. Same privacy tests as ADR-023 §5. |
| 12 | Access and cost guards (fail closed) | In order, before any model call: (1) `judgments.enabled === "true"` (AppSetting, missing = off); (2) price and rate present, strict FX reader as in ADR-023 (no 85 fallback); (3) signed-in user and plan allowed by Vikram's rule; (4) user daily count; (5) user monthly ₹; (6) global daily and monthly ₹ with alerts, reserve then settle in paise. The numbers are Vikram's; defaults in code are zero, so nothing runs until he sets them. |
| 13 | Charging | Not decided here. Two options for Vikram and Priya: included in the subscription with caps (as the assistant), or Ink per summary through T-226's hold, settle and release (the cheaper path to build, since the mechanism exists). The ticket needs the answer before 286a starts. At the ADR-023 rates a 40,000-token summary costs about ₹0.4 to ₹0.5 in model fees, so either option is affordable; Vikram confirms. |
| 14 | Separation | Not the assistant: a different route, key, prompt and limits. The assistant's classifier keeps sending "summarise this judgment" to a refusal or a pointer to this page (a one-line change in 253b, noted there). |
| 15 | Quality bar | Ajay supplies 10 real Supreme Court or High Court judgments (public text) of varied length. CI uses a mocked LLM with recorded outputs, so the verifier is fully tested without a real call. The lead runs the real model once on the 10 and reports: verified-quote coverage per judgment, count of dropped items, any status word or invented citation that reached the output (must be zero). Anushka tests each release on real matters (tier A). |

## What is explicitly not in P0

Upload (T-286c), OCR, long-judgment chunking, any stored history, export to a draft, citation check (P1), search (P2), a corpus, and any case named that the advocate did not paste.

## Build split

| Ticket | Scope | Files (claim) | Gates |
| ------ | ----- | ------------- | ----- |
| **T-286a** Backend | Paragraph parser, verifier, prompt and schema, route, guards, `judgmentcalls` model, privacy and fence tests, fixtures | `apps/drafting/src/judgments/**`, `apps/drafting/src/models/JudgmentCall.model.ts`, `apps/drafting/src/app.ts` (one mount line), `apps/drafting/src/config/env.ts` (one key), `__tests__/judgments-*.test.ts` and fixtures | Ajay's rule and labels; `judgments/prompt/` joins `legal-content-paths.md`; Vikram's price and caps; T-285's keep-alive helper merged |
| **T-286c** Gateway | `/api/judgments` mount with `authChain`, plan limiter and a per-IP limiter; SSE or JSON passes through | `apps/gateway/src/app.ts`, `middleware/rateLimiter.ts`, test | None. Can pair with T-253c on one lead |
| **T-286b** Web | Paste box, result with quotes and paragraph numbers, the "could not be verified" line, labels, disclaimer, copy | `apps/web/...` (lead names files on claim) | Rajesh's design; 286a's contract; Anushka's browser pass |
| **T-286d** Upload (later) | Text PDF in, text out, then the same path | Decided with T-304 | T-304's extractor choice |

**Order:** 286a and 286c in parallel, then 286b. No `packages/shared`, no root config.

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| The model quotes accurately but picks the wrong paragraph as "the holding" | The advocate sees the quote and the paragraph and is told to check; Ajay's labels say so; Anushka samples |
| Verification drops too much and the result looks empty | Coverage is measured on Ajay's 10; below 85% the model is raised through the setting |
| The paragraph parser fails on an odd layout | Fallback is whole-text matching with `para` shown as "not numbered"; the parser has fixtures from Ajay's 10 |
| Pasted text is not a judgment (an agreement, a client letter) | A cheap rules check (court words, "JUDGMENT/ORDER", paragraph numbering) refuses with a clear line; no model call |
| Cost creep | Caps are zero until Vikram sets them; the 150,000-character input limit; global ₹ cap and kill switch |
