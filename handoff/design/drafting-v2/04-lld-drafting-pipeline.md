# Drafting v2 — Low-level design: the compiler

Module layout (`apps/drafting/src/compiler/`): `plan.ts`, `retrieve.ts`, `draft.ts`, `verify.ts`, `repair.ts`, `render.ts`, `markers.ts`, `contextPack.ts`, `run.ts` (orchestrator). Library in `apps/drafting/src/library/`: `ingest/*`, `lookup.ts`, `search.ts`, `graph.ts`.

## 1. Contracts

```ts
// plan.ts — small model, JSON only, structured output enforced (output_config.format)
interface Plan {
  kindId: string; kindVersion: number;
  asOf: { rule: 'offence_date'|'filing_date'|'execution_date'|'notice_date'; date: string };
  parts: Array<{
    partId: string; partTypeId: string; order: number;
    factKeys: string[];                      // ledger keys this part needs
    needs: AuthorityNeed[];                   // structured, never free text law
    tokenBudget: number;
  }>;
}
type AuthorityNeed =
  | { type: 'provision'; act: string; section: string; sub?: string; asOf: string }
  | { type: 'judgment'; issue: string; courts: string[]; limit: number; after?: string }
  | { type: 'form'; forumId: string; formName: string }
  | { type: 'commentary'; topic: string; limit: number };
```

```ts
// retrieve.ts — no model
interface ContextPack {
  facts: Array<{ id: string; key: string; display: string; source: FactSource }>;
  passages: Array<{ id: string; version: number; parentType: string; label: string; text: string; validFrom: string; validTo?: string; status?: string }>;
  misses: AuthorityNeed[];                    // needs the library could not satisfy → blanks
}
```
Provision lookup: `findProvision(act, section, sub, asOf)` = exact match on `{act, section, sub}` with `validFrom ≤ asOf < validTo` (or no `validTo`); if the kind's as-of date is before the new law's commencement and the act is a new-law act, follow `law_mappings` to the old-law provision (and vice versa) — this is T-245a's switch, generalised and data-driven. Judgment search: Atlas Search compound query (issue terms on `issues`/`ratio`, filter `court ∈ courts`, `status.code = good`, `decidedOn ≥ after`), phase 2 adds a vector `knnBeta` leg combined by reciprocal rank fusion; top `limit` passages, each annotated with status and date.

```ts
// draft.ts — drafting model, one call per part (grouped when small)
// system = part writingRules (signed) + kind instanceRules + global compiler rules (below), cached (1h)
// user   = ContextPack slice for the part + the part skeleton (if any) + output grammar
// output = plain text with markers:  "...the applicant is in custody since 12 Aug 2026⟦fact:f_12⟧ ... under Section 480(1) of the BNSS⟦auth:p_8831⟧."
```
Global compiler rules (prompt, signed by Ajay as legal content): (1) state no law that is not in the passages given; (2) attach `⟦auth:id⟧` to every sentence that states, cites or applies law and `⟦fact:id⟧` to every sentence that states a fact; (3) when a needed authority is missing, write the signed blank `[To be confirmed: <what>]`; (4) never add a case, ground or relief the facts and parts do not call for; (5) quote verbatim only inside quotation marks and only from a passage.

```ts
// verify.ts — deterministic, then judge
interface VerifyResult { ok: boolean; failures: Failure[] }
type Failure = { partId: string; sentenceNo: number; reason:
  'missing_marker'|'unknown_auth_id'|'auth_not_valid_as_of'|'auth_bad_law'|'auth_wrong_forum'|'quote_mismatch'|
  'fact_not_in_ledger'|'fact_mismatch'|'date_inconsistent'|'forbidden_content'|'judge_unsupported'; detail: string };
```
Checks in order, cheapest first: markers parse → ids resolve to the pack → validity window vs `asOf` → judgment status `good` → forum/jurisdiction allowed for the part → quote spans (text inside “ ” / " ") normalised-whitespace equal to a substring of the passage → facts (reuse D1 verifier) → cross-part date/number consistency → part `forbids`. Then the judge: cheap model, input = the part text with markers stripped and the list of allowed ids; output = JSON list of sentence numbers that assert law or fact without support. Any judge hit is a failure `judge_unsupported`.

```ts
// repair.ts — bounded
// round 1: re-draft only the failed sentences with the failure reasons, same context pack
// round 2: same; still failing → apply part rule: 'blank' (signed wording) | 'drop'
// never a round 3; the run records every failure and its resolution
```

```ts
// render.ts
// strips markers → provenance map; applies forum_formats; produces the editor text and the PDF input;
// optional "Authorities relied on" appendix under each passage's licence displayPolicy
```

## 2. Orchestrator (`run.ts`)

```
run(documentId):
  dr = DraftRun.create(kind, asOf, forum)
  for stage in [plan, retrieve, draft, verify, repair*, render]:
     if dr.stages[stage].status == 'done': continue      // resumable
     out = stage(dr)                                     // pure over dr + DB
     dr.stages[stage] = done, out persisted
  stream text to the user from the draft stage onward (SSE as today); the verify/repair stages
  may rewrite sentences — the client receives a final "replace part" event per repaired part.
```
Ink: hold before `plan`, settle after `render` with the measured cost (Ink v2 size class fixed at hold time; measured cost only informs the class table).

## 3. Markers (`markers.ts`)
`⟦auth:<id>⟧`, `⟦fact:<id>⟧`, `⟦blank:<slug>⟧`. Parsing is a regex over sentence boundaries; ids are opaque strings from the context pack (not DB ids — the pack maps short ids `p_1…p_n`, `f_1…f_n` to real ids so the model cannot cite anything outside the pack by construction).

## 4. Ingestion (`library/ingest/*`)
`parse` (pdf → text with page map; docx; html; json for pre-structured acts) → `structure` (per source kind: act → sections by regex grammar + manual overrides; judgment → paras, headnote, ratio candidates; book → chapters/headings) → `chunk` (by structure, ≤ ~1,200 tokens, overlap only within a section) → `enrich` (extract section references and citations with normalisers; dates; language) → `write` (upsert passages by `passageKey`; provisions/judgments by natural key + version) → `index` (Atlas Search picks up automatically; phase 2: embed batch → `embedding`). Each step records stats on the `sources.versions[]` entry; failures keep the previous active version.

## 5. Admin API (drafting, admin role)
`POST /admin/library/sources` (multipart) · `GET /admin/library/sources/:id` · `POST /admin/library/sources/:id/reindex` · `POST /admin/library/sources/:id/publish` · `GET /admin/library/provisions?act=&section=&asOf=` · `PATCH /admin/library/judgments/:id/status` (Ajay/admin, with note) · `GET/POST/PATCH /admin/grammar/kinds` · `PATCH /admin/grammar/parts/:id/rules` (creates a new version; sign-off required before `live`) · `GET /admin/eval/kinds/:id`.

## 6. Tests
Unit: parsers per source kind with fixtures; provision lookup across validity windows and law mappings; verifier per failure reason (one test each, mutation-checked); marker parser. Contract: plan JSON schema; context pack budget. Golden: per kind, recorded replies off on dispatch, diffs to Ajay; new fixtures from approved drafts.
