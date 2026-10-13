# ADR-025 — The model fills a signed skeleton; legal data is the signed file; one entitlement model

| Field | Value |
| --- | --- |
| Status | Proposed by Arjun, 13 Oct 2026. Founder delegated handling to Arjun (13 Oct, night); building starts on the order below. Founder reviews the HTML version in the morning |
| Review doc | https://claude.ai/artifact/6yYqbJXug8ay5uubA5oNHD (same content, with diagrams) |
| Basis | Anushka's runs of 6, 7 and 13 Oct (all FAIL on the same finding); three read-only code surveys on `develop_staging` 3ec5907 |
| Supersedes | Nothing. Completes ADR-021 (code assembles title, prayer, verification) and ADR-022 (fact ledger) by extending them to the body |

## Problem

Three quality runs failed on drafts asserting facts the advocate never gave, the third on a build that already carried T-147c/d/e. Cause: the Drafter returns free prose plus a self-reported clause trailer (`streamLLM`, no schema); the only guards are a banned-phrase substring list (5 of 92 packs) and an entity matcher. A denylist over free prose is default-allow: "no criminal antecedents" is caught, "woman of good character" is not. The checks panel trusts the model's trailer and string-matches the prose, so it reports false findings on every draft. Separately: signed legal JSON reaches users through a seed that skips existing rows (develop served pre-correction CrPC 358–362 rows); three tools parse sections their own way; three entitlement models coexist and the UI reads the dead one; the real-model golden set has never run.

## Decisions

**D1 (architecture).** The Drafter returns structured output (tool use / JSON schema): `paragraphs[]{ clauseId, factRefs[], text }`. Every paragraph names a clause from an Ajay-signed pack skeleton; every factual sentence names a ledger key. A code renderer builds the document: no `clauseId` → paragraph dropped; no `factRef` where one is required → `{{MISSING: label}}`; an entity not in the referenced fact → blank; duplicate sections → one. Free text is allowed only in clauses whose source is the advocate's own words (`facts_narrative`, a ground's `raw_span`), rephrased for grammar only. Grounds come back as a list with one ref each. The checks panel reads rendered clause ids. One generation path for packs; template and legacy paths retired. v1 packs: bail regular, anticipatory, default, Magistrate; s.138 notice. Other packs stay on today's path, labelled "starting draft", and move pack by pack as skeletons are signed.

**D2 (structure).** The four signed section files (`config/sections/*.json`, `bns-offences.json`) are loaded at boot and served from memory; their SHA-256 appears in `/health`; `SectionMapping` in Mongo and its Redis cache are retired. Every tool (bail checker, converter, bulk converter, timeline, preflight) parses with `readSectionsCharged` (T-277). An unknown maximum sentence never ranks as infinite; unknown, `verify`-flagged or missing rows display "Not verified — check the Gazette". `bns-offences.json`, `bns-mapping.json`, `bns-triable-by.json`, the resolver, `timeline.service.ts` and the four free-tool pages join `legal-content-paths.md`.

**D3 (structure).** Ink is the only entitlement model. The documents-per-month counter (`/documents/usage` limit, `enforceFreeLimit`, `BonusCredit`) and legacy buckets are removed, legacy balances migrated once into Ink top-up. The web reads every price from billing `GET /plans`; subscribe sends `planId`; Confirm shows the template's `creditsCost`; the SSE `done` event carries the new balance. Free Ink is lifetime and the copy says so.

**D4 (process).** The real-model golden set is a required check on changes under `drafter.prompts.ts`, `config/document-rules/`, `config/sections/`, the normalizer and the renderer, and runs nightly. Anushka's six run-3 drafts become fixtures. Web build + typecheck + a Playwright run of the bail brief flow join CI. Anushka tests one or two tickets at a time on a golden-set-green develop.

**D5 (operations).** BullMQ repeatable jobs on the existing Redis, run in the email-worker process (T-187 daily unlink, T-358, future refills). Atlas backup on (founder). Deploys from the GitHub workflows, secrets in GitHub. ADR-019–022 recovered and committed under `docs/adr/`.

## Order of work (Priya sequences; claims stay hers)

1. **Now, small-fix mode, no new architecture:** (a) Pro-buys-Solo: `settings/page.tsx` sends `planId`, catalogue-driven label; (b) T-369 web CI; (c) D2 core: serve the four files from memory with SHA in `/health`, one reader for all four tools (replaces the reseed in T-360, the parser part of T-361); (d) hide the documents counter and show `creditsCost` on Confirm (the display half of T-364); (e) golden-set baseline run once the secrets exist.
2. **Next, full chain, two leads:** D1 for the four bail packs — lead A: output contract + renderer + checks panel + golden assertions; lead B: skeleton loader + migration of `bail_*` packs; Ajay writes the four skeletons in parallel from his T-359 signed text. T-359 and T-362 are built on this, not on list tuning.
3. **Then:** s.138 on D1 (T-363 content rides along); D3 in full; D5 jobs (unblocks T-187/T-358); the small-batch quality cycle.

## Rejected

Retrieval corpus, LLM-as-judge, second model vendor, intake rewrite (ADR-022's reasons hold). Fixing T-359/T-362 by another round of prompt and list edits: three runs show the ceiling of that approach.

## Founder actions (morning list)

GitHub secrets `GOLDEN_SET_ANTHROPIC_API_KEY`, `GOLDEN_SET_MONGODB_URI`; Atlas continuous backup; ADR-019–022 texts from his machine; read-only access tokens (separate list).
