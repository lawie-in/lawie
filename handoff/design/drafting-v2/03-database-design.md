# Drafting v2 — Database design (MongoDB Atlas)

All new collections live in the drafting database. Ids are ObjectIds unless stated. Every record that can change law-facing output carries `validFrom`/`validTo` (validity window) and `version`. Text that Ajay signs carries `signedBy`, `signedAt`, `signatureRef` (commit of the signed file).

## 1. Library

### `sources` — one licensed document as uploaded
```
_id, kind: 'act'|'rules'|'court_rules'|'notification'|'judgment'|'form'|'commentary'|'precedent',
title, shortName, jurisdiction: {country:'IN', state?, court?}, publisher, edition, year,
licence: { holder, ref, displayPolicy: 'quote'|'cite_only'|'internal', expiresAt? },
file: { bucketKey, mime, sha256, pages? }, uploadedBy, uploadedAt,
status: 'queued'|'parsing'|'indexed'|'failed'|'published'|'retired', versions: [{version, indexedAt, stats, publishedAt?}],
activeVersion, error?
```
Index: `{kind:1, status:1}`, `{shortName:1}`, `{'file.sha256':1}` unique (no duplicate uploads).

### `provisions` — one section/rule/article as of a validity window
```
_id, sourceId, sourceVersion, act: 'BNSS', actLong, section: '480', sub?: '1', clause?,
heading, text, textHash, validFrom, validTo?, amendedBy?: sourceId, replaces?: provisionId (old law, e.g. CrPC 437 → BNSS 480),
citationLabel: 'Section 480(1) of the BNSS', keywords: [..], passageId
```
Index: `{act:1, section:1, sub:1, validFrom:-1}` (exact lookup), `{replaces:1}`, Atlas Search on `heading`, `text`.

### `judgments`
```
_id, sourceId, sourceVersion, title, citations: [{style:'neutral'|'AIR'|'SCC'|'other', text}], court: 'SC'|'HC:Patna'|..., bench, decidedOn,
issues: [string], ratio: string (editorial, from the source's headnote), status: {code:'good'|'overruled'|'distinguished'|'referred'|'per_incuriam', by?: judgmentId, since?, setBy, setAt, note}, pages, passageIds: [..]
```
Index: `{court:1, decidedOn:-1}`, `{'status.code':1}`, `{'citations.text':1}`, Atlas Search on `title`, `issues`, `ratio`.

### `passages` — the retrieval unit
```
_id, passageKey: '<sourceId>:<version>:<ordinal>' (unique), sourceId, sourceVersion, parentType: 'provision'|'judgment'|'form'|'commentary', parentId,
text (≤ ~1,200 tokens), tokenCount, locator: {page?, para?, section?}, headingPath: [..], citesProvisions: [{act, section}], citesJudgments: [citationText],
embedding?: [float] (phase 2, vector index), lang: 'en'|'hi', validFrom, validTo?
```
Index: `{passageKey:1}` unique, `{parentType:1, parentId:1}`, Atlas Search (BM25) on `text`, `headingPath`; Atlas Vector Search on `embedding` (phase 2, filter fields `parentType`, `sourceId`, `validFrom`).

### `authority_edges` — the graph
```
_id, from: {type, id}, to: {type, id}, rel: 'amends'|'replaces'|'overrules'|'distinguishes'|'follows'|'interprets'|'cites', since?, setBy: 'ingest'|'ajay'|'admin', note?
```
Index: `{'from.id':1, rel:1}`, `{'to.id':1, rel:1}`.

### `law_mappings` — old ↔ new law (generalises `bns-mapping.json`)
```
_id, fromAct, fromSection, toAct, toSection, effectiveFrom, kind: 'equivalent'|'partial'|'new'|'omitted', signedBy, signatureRef
```

## 2. Grammar

### `part_types` — the ~40 reusable building blocks (code-owned list, data-described)
```
_id: 'cause_title'|'parties'|'jurisdiction'|'facts'|'grounds'|'prayer'|'verification'|'affidavit'|'annexure_index'|'notice_body'|'recitals'|'covenants'|..., 
schema: {requiredFacts: [factKey], optionalFacts: [..], allowedAuthority: ['provision','judgment','form'], maxAuthority: n},
writingRules: {signedText, signedBy, signatureRef, validFrom}, blankWording: {signedText,...}, forbids: ['invented_grounds','uncited_case_law', ...]
```

### `kinds` — a document type (the 92 and every new one)
```
_id: 'bail_regular', name, family: 'criminal'|'civil'|'notice'|'agreement'|'affidavit'|..., forum: {court?, level?},
parts: [{partTypeId, instanceRules?: {signedText,...}, skeleton?: {signedText,...}, order}],
facts: {checklist: [factKey]} (feeds the brief, as today's checklists), asOfRule: 'offence_date'|'filing_date'|'execution_date'|'notice_date',
engine: 'v1'|'v2', status: 'draft'|'signed'|'live'|'retired', signedBy, signedAt, signatureRef, createdBy, version
```
Index: `{family:1, status:1}`, `{engine:1}`.

### `forum_formats` — court/forum presentation rules (today's `court-rules/*.json`)
```
_id: 'patna_hc', name, rules: {...}, signedBy, signatureRef, validFrom
```

## 3. Runs and provenance

### `draft_runs` — one compile
```
_id, documentId, userId, kindId, kindVersion, engine: 'v2', asOf: {rule, date}, forumId,
stages: [{name:'plan'|'retrieve'|'draft'|'verify'|'repair'|'render', status, startedAt, endedAt, usage?: {model, in, out, cacheRead, costUsd}, error?}],
plan: {...}, contextPack: {facts: [factId], passages: [{passageId, version, tokens}]},
verify: {rounds: n, failures: [{partId, sentenceNo, reason, resolved: 'repaired'|'blank'|'dropped'}]},
provenance: [{partId, sentenceNo, factIds: [..], passageIds: [..]}], blanks: n, totalCostUsd
```
Index: `{documentId:1}`, `{kindId:1, 'stages.name':1}`, `{createdAt:-1}`.

`documents` (exists) gains `draftRunId`, `provenanceVersion`. `Generation`/`LlmAuxCall` keep recording usage per call as today.

## 4. Evaluation

### `kind_evals` — golden set results per kind
```
_id, kindId, runAt, fixtures: n, passed, failed, blankRate, citationMissRate, avgCostUsd, modelIds, gitSha, notes
```

## 5. What goes away (post-migration)
`Template`, `TemplateUsage`, `SectionMapping` (→ `law_mappings`), the JSON pack files (→ `kinds` + `part_types`), `bns-*.json` (→ `provisions` + `law_mappings`). Not before every kind is on v2 and the golden set passes.

## 6. Amendments from Ajay's constraints (f44eb59)

- `sources.kind` gains `'constitution' | 'notification' | 'state_amendment' | 'practice_direction' | 'statutory_form'`; `sources.jurisdiction.state` is required for `state_amendment`; `court` required for `court_rules`, `practice_direction`.
- `judgments.status` becomes `{ code: 'good'|'overruled'|'reversed_or_modified'|'per_incuriam'|'referred_to_larger_bench'|'stayed'|'review_pending', scope: [{paras: [n], point?: string}], by?: judgmentId, since?, verifiedBy, verifiedOn, source: 'citator'|'clo'|'admin', notes: [{kind:'distinguished'|..., by: judgmentId, text}] }`; plus `benchStrength: number`, `neutralCitation?`, `reportCitations: [{style, text, licensed: boolean}]`.
- `passages` gain `role: 'ratio'|'obiter'|'headnote'|'facts'|'order'|'text'` (judgment paras tagged at ingest, CLO-correctable) and `quotable: boolean` (false for headnotes, summaries, commentary).
- `kinds` gain `registry: { statutoryBasis, forum, verificationForm, mandatoryParts: [partTypeId], courtFeeHint?, limitationHint?, signedBy?, signedAt?, signatureRef? }` and `asOf: { substantive: factKey, procedure: factKey }` replacing `asOfRule`; `status` gains `'unreviewed'` (drafts with the banner, per D10).
- `part_types.schema.allowedAuthority` never includes `'commentary'`.
- New `suggestions` on `draft_runs`: `{ grounds: [{text, authorityIds, accepted: boolean}], judgments: [{judgmentId, point, accepted: boolean}] }` — shown, never inserted until accepted.
