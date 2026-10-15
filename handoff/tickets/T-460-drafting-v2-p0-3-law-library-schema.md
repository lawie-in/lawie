# T-460: Drafting v2 phase 0 (P0-3): Law Library schema

| Field  | Value |
| ------ | ----- |
| Status | Blocked: after T-403. Nobody starts before v1 is on main. Priya, 15 Oct 2026 |
| Owner  | Lead to be assigned after T-403; Arjun (architecture and acceptance criteria) |
| Mode   | Full chain |

## Source

ADR-026 "Drafting v2: the Law Library and the Document Compiler", approved by the founder 15 Oct 2026 (D1 to D10). Phase 0 ticket P0-3, section 11 of handoff/design/drafting-v2/00-adr-026-drafting-v2.md.

## Scope

sources, source_versions, provisions, judgments, passages, authority_edges, law_mappings + indexes; Atlas Search index definition.

Services: drafting.

## Gate

none

## Acceptance criteria

See the Arjun section below.

## Architecture reference

handoff/design/drafting-v2/ (ADR-026, HLD, system design, DB design, LLD).

## Arjun (15 Oct 2026) — acceptance criteria

1. Mongoose models in `apps/drafting` for `sources`, `source_versions`, `provisions`, `judgments`, `passages`, `authority_edges`, `law_mappings` exactly as `03-database-design.md` lists them, with the enums as data: `sources.class` = the 9 Ajay classes; `judgments.status` = `good_law|distinguished|overruled|referred|unknown`; `sources.displayPolicy` = `quote|cite_only|internal`; `sources.status` = `uploaded|review|live|retired`.
2. Indexes: `passages` unique on `(ownerType, ownerId, para)`; `passages.hash`; `provisions` on `(act, section, asOfFrom)`; `judgments` on `neutralCitation`; `law_mappings` on `(oldAct, oldSection)`; `authority_edges` on `fromId` and `toId`; `source_versions` unique on `(sourceId, version)`.
3. `passages.text` is stored byte-exact; `hash` = sha256 of `text`; a model-level validator rejects a write where the hash does not match the text.
4. The Atlas Search index definition (BM25 on `passages.text`, filters on `ownerType`, `asOfFrom/To`, `status`, `displayPolicy`) is committed as JSON under `apps/drafting/atlas/` with a README on how the founder applies it in Atlas; code does not create it at boot. A Vector index definition is committed alongside, marked phase 2, not applied.
5. A `retrieval.service.ts` skeleton exposes `findPassages(need: AuthorityNeed): Promise<Passage[]>` (contract from `04-lld`) implemented against plain Mongo text/regex for tests, with the Atlas `$search` path behind a config flag `LIBRARY_SEARCH=atlas|mongo` (default `mongo` so tests never need Atlas).
6. Tests: every model's validators and unique indexes (mongodb-memory-server as the drafting tests already use); hash validator; `findPassages` on the `mongo` path with as-of and status filters.
7. No route, no UI, no data in this ticket.
