# Drafting v2 — Law Library and the admin panel

## 1. What the founder does (no code)

1. **Upload** a source in the admin panel: file (PDF, DOCX, HTML, or a JSON for already-structured acts), kind (Act / Rules / Court rules / Notification / Judgment / Form / Commentary / Precedent), title, jurisdiction, publisher, edition/year, licence (holder, reference, display policy: *quote* / *cite only* / *internal*), optional "in force from".
2. **Watch it index**: status moves queued → parsing → indexed; the page shows counts (sections found, passages, citations extracted) and 5 sample passages so a wrong parse is visible at once.
3. **Publish**: makes the version active for retrieval. Until then drafts do not see it. Re-uploading a new edition creates version n+1; publishing it retires n for new drafts, old drafts keep their references.
4. **Judgment status** (Ajay or an admin with Ajay's note): mark overruled / distinguished / referred, with the citing judgment and a note; the system never infers this.
5. **Kinds**: create a document kind from existing parts (drag parts, set order, pick forum format, set the as-of rule, attach a fact checklist). If every part's rules are already signed, the kind is `live` after my technical check; if a part needs new rules, Ajay signs them in the panel (the signature records the commit of the exported text, as today's `handoff/legal/*-signed.md`).
6. **Dashboard**: per kind — drafts, blank rate, citation-miss rate, verifier failure reasons, golden-set last run, cost per draft; per source — usage count in drafts (tells the founder which licences earn their keep).

## 2. Source kinds and how each is indexed

| Kind | Structure extracted | Retrieval | Validity |
|---|---|---|---|
| Act / Rules | chapters → sections → sub-sections/clauses; definitions; schedules | exact lookup by section + as-of; BM25 on text for "which section says…" | per section: in-force window; amendments create new versions via a diff against the previous edition (admin confirms the diff) |
| Court rules / practice directions | rules by number; forms | exact + BM25; forum-scoped | per rule |
| Notification / circular | whole document + date | BM25, date-filtered | from its date |
| Judgment | headnote, issues, ratio, paras; citations in and out | BM25 (phase 1) + legal-domain vector (phase 2); filtered by court, date, status | status window |
| Form / precedent | fields and body | exact by forum + name | per version |
| Commentary / book | chapters/headings → passages; citations out | BM25 + vector; quote only if the licence allows | per edition |

Hindi sources: parsed and indexed with `lang: 'hi'`; retrieval is per language of the draft; translation is not attempted by the library.

## 3. Licence handling (the founder owns licensing; the system enforces display)

- `displayPolicy = quote`: passages may be quoted verbatim in drafts and shown in the provenance sidebar.
- `cite_only`: the draft may cite (name, section, citation) but not reproduce text; the sidebar shows the citation and a locator, not the text.
- `internal`: used for retrieval and verification only; never shown or quoted; the draft cites the primary source instead (for commentaries that explain a section, the draft cites the section).
- Every passage used in a draft is recorded; an expired licence (`licence.expiresAt`) retires the source from new drafts automatically and flags it on the dashboard.

## 4. Quality controls for the library itself

- Parse confidence per source (sections found vs expected from the table of contents); below threshold the source stays `indexed`, not `published`, until an admin reviews.
- Duplicate detection by file hash and by (act, edition).
- A nightly job re-validates every `provision` validity window against its amendments and lists conflicts.
- "Used in drafts" counters per passage make it obvious which parts of the library matter and which parses are never hit (likely wrong).

## 5. Where this plugs into today's code

- `apps/drafting/src/config/sections/**`, `bns-*.json`, `court-rules/*.json`, `document-rules/**` become seeds for the first library records (a one-off `library:import-config` script), so phase 0 starts with everything we already have signed.
- The intake's section bookmarks and recents (`SectionBookmark`, `SectionRecent`) point at `provisions` instead of static JSON.
- The law switch's pairs table (`law-switch.ts`) becomes `law_mappings` rows, signed by Ajay as now.
