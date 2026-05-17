# ADR-018: Generic Template Wiring — Scaling 6 → 92 Templates Without Per-Template Code

- **Status:** Proposed
- **Date:** 2026-05-12
- **Author:** Arjun (CTO)
- **Reviewers:** Priya (PM), Vishal (Dev), Ajay (CLO)
- **Supersedes:** Implicit pattern set by SCRUM-43 (`docs/templates/*.json` + `DynamicFormRenderer`)

---

## TL;DR

We already built a generic, config-driven pipeline for the original 6 templates (`docs/templates/*.json` + `template-engine.service.ts` + `apps/web/src/components/form/DynamicFormRenderer.tsx`). Ajay then authored 92 new document-rule JSONs in a **different, incompatible shape** (`apps/drafting/src/config/document-rules/*.json`). The wiring problem isn't building generic infra — it's **bridging the two schemas**, then auto-promoting document-rule JSONs into the existing rendering pipeline.

Decision: **adopt the existing SCRUM-43 pipeline as the canonical generic, write a one-time migration script that promotes each document-rule into the canonical `TemplateConfig` shape, and seed everything from disk at boot.** Per-template wire-up effort drops from ~6–8 hours TODAY to ~10–20 minutes AFTER migration.

---

## 1. Current end-to-end flow (the 6 production templates)

Verified by reading: `template-engine.service.ts`, `prompt-assembler.ts`, `DynamicFormRenderer.tsx`, `dashboard/new/page.tsx`, `dashboard/templates/page.tsx`, `Template.model.ts`, `bail_anticipatory.json` (both flavours).

1. **User clicks "New Document"** → `apps/web/src/app/dashboard/new/page.tsx` mounts.
2. **Template list fetch** → `GET /api/documents/template-configs` → server lists files in `/docs/templates/*.json` (via `listTemplateConfigs()` in `template-engine.service.ts`, line 163). Filters by `metadata.status === 'active'`.
3. **User selects a template** → frontend fetches full config (`/api/documents/template-configs/:id`) → `loadTemplateConfig()` reads `/docs/templates/{id}.json`.
4. **Form rendering** → `DynamicFormRenderer.tsx` reads `config.form_schema.steps[].fields[]` and renders inputs by `field.type` (`text`, `date`, `number`, `textarea`, `dropdown`, `dropdown_search`, `multi_select_search`, `checkbox_group`). Conditional visibility via `show_if`. Zero per-template React components.
5. **Submit → preflight** → `POST /api/documents/preflight` runs the SCRUM-69 verification layer (`hard_block` / `soft_warn` / `pass`).
6. **Generate (SSE)** → `POST /api/documents/generate-from-template` streams Server-Sent Events. Server-side:
   - `buildPlaceholderContext()` flattens form data + computed fields + court-rule data.
   - For each `document_structure.sections[]`: if `type=template`, `replacePlaceholders()`; if `type=ai_generated`, `buildAISystemPrompt()` + `buildAIUserPrompt()` → Anthropic call.
   - `assembleDocument()` emits styled HTML with per-section alignment.
7. **Post-gen validator** → coherence checks (`detectCoherenceMismatches`), placeholder-leak detection (`detectLeakedPlaceholders`), BNS whitelist (`BNS_VALID_SECTIONS`).
8. **DB save** → Document model. Note: `Template.model.ts` exists but is **not the source of truth** today — the template registry IS the filesystem directory `/docs/templates/`.
9. **Editor** → `dashboard/documents/[id]/page.tsx` loads TipTap editor with HTML content.
10. **Export** → PDF/DOCX routes consume the saved HTML.

**Key observation:** the pipeline IS already generic. There is no per-template React code for the 6 production templates today. The "wiring problem" is purely about a **schema mismatch** between the 6 existing JSONs and the 86 new ones.

---

## 2. The 86-template wiring problem

### The two schemas (HARD truth, verified in code)

| Aspect          | SCHEMA-A: `docs/templates/*.json` (6 active)                                                      | SCHEMA-B: `apps/drafting/src/config/document-rules/*.json` (92 incl. duplicates) |
| --------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Owner           | Used by `template-engine.service.ts`                                                              | Used by `prompt-assembler.ts`                                                    |
| Field key       | `field_id`                                                                                        | `id`                                                                             |
| Form structure  | `form_schema.steps[].fields[]` (multi-step)                                                       | `form_schema.fields[]` (flat)                                                    |
| Field types     | 8 types (`text/date/number/textarea/dropdown/dropdown_search/multi_select_search/checkbox_group`) | 6+ types (`text/date/number/textarea/select/checkbox/...`) — not normalized      |
| Document body   | `document_structure.sections[]` (template + ai_generated mixed sections)                          | `mandatoryClauses[]` + `promptInstructions[]` (free-text prompt builder)         |
| Court coverage  | `applicable_courts.{court_levels,states}`                                                         | `court_levels[]` only                                                            |
| Cause title     | Built from sections                                                                               | `causeTitle.format` string                                                       |
| Validation      | `validation_rules` (BNS whitelist, mandatory_sections)                                            | `validation_rules` (lighter; not consistent across files)                        |
| Prompt strategy | Per-section AI calls with explicit `prompt_context`                                               | Single combined prompt assembled at call time                                    |

### What Vishal does per template TODAY (no abstraction)

Per the 6 → 7th template he just shipped:

| Step                                                                                                                                                                           | Hours                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| 1. Write `/docs/templates/{id}.json` matching SCHEMA-A (form_schema.steps, document_structure.sections, computed_fields) — even though Ajay already wrote the SCHEMA-B version | 3–4h                        |
| 2. Hand-tune `prompt_context` per AI section so output passes BNS whitelist + advocate-tone                                                                                    | 1–2h                        |
| 3. Wire the template_id into PaywallModal / credit cost                                                                                                                        | 0.25h                       |
| 4. Smoke-test: form submit → preflight → generate → PDF export                                                                                                                 | 1h                          |
| 5. Per-template React tweaks if `DynamicFormRenderer` chokes on a quirk (cascading dropdowns, file uploads not yet supported)                                                  | 0–2h                        |
| 6. Backend tests for placeholder coverage                                                                                                                                      | 0.5h                        |
| **Total**                                                                                                                                                                      | **~6–8 hours per template** |

92 templates × 7h = **~644 engineering hours** ≈ 16 full weeks. Unacceptable.

---

## 3. The generic pattern (proposed)

### Architecture (one-line)

**Treat `apps/drafting/src/config/document-rules/*.json` as the single source of truth and auto-promote it into the canonical `TemplateConfig` shape at boot time.**

### Components

1. **Canonical schema** = SCHEMA-A (the one `DynamicFormRenderer` and `template-engine.service.ts` already consume). Don't invent a third.
2. **Promoter (build-time + runtime)** — a pure function `promoteDocRuleToTemplateConfig(docRuleJson) → TemplateConfig` that:
   - Maps `form_schema.fields[]` (flat) → `form_schema.steps[].fields[]` (auto-grouped into 3 logical steps: Parties / Case Facts / Relief).
   - Renames `id` → `field_id`, normalizes type aliases (`select`→`dropdown`, `multi_select`→`multi_select_search`).
   - Derives `document_structure.sections[]` from `causeTitle.format` (1 template section) + 1 catch-all `ai_generated` section using `promptInstructions[]` as `prompt_context` + per-clause sections from `mandatoryClauses[]`.
   - Carries `creditsCost`, `category`, `relevantActs` through.
3. **Boot-time registry seed** — on Express startup, walk both directories, promote SCHEMA-B files where SCHEMA-A is absent, and populate `Template` collection in Mongo. Filesystem remains the source of truth; Mongo is a read-through cache for fast list/filter/usage-count.
4. **Frontend** — `DynamicFormRenderer.tsx` requires **zero changes** for any template that passes the promoter cleanly.
5. **Validation** — runs declaratively off `validation_rules` (already implemented). Promoter ensures every promoted template has at least the BNS whitelist + mandatory-sections shape.
6. **Template listing** — `dashboard/templates/page.tsx` already auto-derives from the API. No change.

---

## 4. Bridge between document-rules and prompt-templates — merge or derive?

**Recommendation: derive, don't merge.**

- **Why not merge:** Ajay owns `document-rules` and continues to edit them as legal content evolves. Forcing a single mega-file means CLO edits land in a file that also contains UI form steps Ajay shouldn't touch.
- **Why derive:** keep `document-rules` as CLO's source-of-truth. Run the promoter at boot AND offer a one-time scaffold script `pnpm scripts/scaffold-prompt-template.ts {docType}` that emits a hand-tunable `/docs/templates/{id}.json` ONLY when the engineer needs to override the auto-generated prompt for a high-value template (top-10 revenue drivers).
- **Override semantics:** if `/docs/templates/{id}.json` exists, use it verbatim (current SCRUM-43 path). Else, generate it in-memory from the document-rule. **No two files for the same template on disk.**

---

## 5. Form-renderer schema spec (LOCK THIS)

```json
{
  "field_id": "string — snake_case, unique within template",
  "label": "string — Title Case, advocate-facing",
  "type": "text | date | number | textarea | dropdown | dropdown_search | multi_select_search | checkbox_group | file | currency",
  "required": "boolean",
  "placeholder": "string — optional",
  "default": "string | null",
  "options": [{ "id": "string", "label": "string" }],
  "options_from": "bns_mapping | courts_db | states_db — runtime fetch",
  "source": "alias of options_from for legacy fields",
  "filtered_by": ["other_field_id"],
  "cascades_to": ["dependent_field_id"],
  "show_if": "field_id === value | field_id !== value",
  "inject_into": ["section_id_or_ai_prompt"],
  "min_length": "number",
  "max_length": "number",
  "min_select": "number",
  "validation": { "regex": "string", "errorMessage": "string" }
}
```

**Migration script must** rewrite the 86 SCHEMA-B files to use this exact spec (or emit the promoted form at boot — Vishal's choice). New types `file` and `currency` are forward declarations; `DynamicFormRenderer` needs to add handlers in Sprint 1.

---

## 6. The generic React component

**Already exists:** `apps/web/src/components/form/DynamicFormRenderer.tsx`.

Required additions (Sprint 1):

- `file` field type (S3 presigned upload — defer to FilePicker primitive).
- `currency` field type (Indian numbering, ₹ prefix).
- `validation.regex` runtime check via `react-hook-form` + `zod` resolver (currently uses bespoke validators in `template-engine.service.ts:validateFormData`).
- Auto-step grouping when input has no `steps` (single-page mode for templates with ≤8 fields).

Component stays at the same path. No new file.

---

## 7. Per-template wire-up effort POST-abstraction

| Step                                                                                                                                      | Time                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Ajay drops new JSON into `apps/drafting/src/config/document-rules/{id}.json` (already done for 92)                                        | 0                                           |
| Restart drafting service → promoter auto-registers template                                                                               | 0                                           |
| Smoke-test: open `dashboard/new`, fill form, submit, verify PDF                                                                           | 10 min                                      |
| If output quality below bar → run `scaffold-prompt-template.ts {id}`, hand-tune `prompt_context` in resulting `/docs/templates/{id}.json` | 30–60 min (only for top-10 revenue drivers) |
| **Total (commodity template)**                                                                                                            | **~10 minutes**                             |
| **Total (revenue-driver template with hand-tuned prompts)**                                                                               | **~60 minutes**                             |

---

## 8. Migration plan

| Sprint                 | Scope                                                                                                                                                                                                                                                                          | Exit criteria                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Sprint 1 (this sprint) | Build `promoteDocRuleToTemplateConfig()` + boot-time registry seed + extend `DynamicFormRenderer` for `file`/`currency`/`regex` + write SCHEMA-A spec into `/docs/architecture/`. Add unit tests against all 92 JSONs (promoter must produce a valid TemplateConfig for each). | All 92 templates appear in `/dashboard/templates` listing. Zero render errors. No PDF generation guaranteed yet. |
| Sprint 2               | Switch all 6 original templates to load through the promoter path (delete the duplicate `/docs/templates/*.json` if unchanged). Manual diff-test the PDF output for each to confirm zero regression.                                                                           | 6 original templates pass golden-PDF diff.                                                                       |
| Sprint 3               | Smoke-test the top-10 revenue-driver templates end-to-end (bail family, quashing, plaints). Hand-tune prompts where quality dips. Ship to demo.lawie.in.                                                                                                                       | 10 templates have a green smoke run + Ajay sign-off.                                                             |
| Sprint 4               | Batch ship the remaining 76 templates in groups of ~25, mostly UX polish + edge-case fixes.                                                                                                                                                                                    | All 92 live on demo.lawie.in.                                                                                    |

Total: **~4 sprints (8 weeks) to fully wire 92 templates** vs ~16 weeks of per-template hand-wiring.

---

## 9. Risks

| Risk                                                                                               | Likelihood | Impact | Mitigation                                                                                                                                              |
| -------------------------------------------------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Promoter fails on a quirky SCHEMA-B file (e.g. cascading dropdowns Ajay encoded as free text)      | High       | Medium | Sprint 1 unit test that runs promoter against all 92 files; fail-loud, list mismatches in a CI artifact                                                 |
| Auto-generated prompts produce lower-quality drafts than hand-tuned ones                           | Medium     | High   | Top-10 revenue templates get hand-tuned overrides in Sprint 3; for the long tail, "good enough" is acceptable per 0–5 year advocate persona             |
| The 6 original SCHEMA-A files drift after we switch them to promoter path (formatting nuance lost) | Medium     | High   | Sprint 2 golden-PDF diff gate; if any diff fails, keep the SCHEMA-A override file in place for that template                                            |
| Mongo `Template` collection drift from filesystem                                                  | Low        | Low    | Boot-time sync is one-way (filesystem → Mongo). Never write to `Template` from the app; usage_count migrates to a separate collection (`TemplateUsage`) |
| `file` upload type not implemented in Sprint 1 → templates needing attachments break               | Medium     | Medium | Filter promoter to skip `file` fields until SCRUM-XX (S3 presign) lands. Show "coming soon" badge in template listing                                   |
| Two schemas coexisting indefinitely creates confusion for Vishal                                   | Medium     | Medium | Sprint 1 deliverable INCLUDES deleting all 6 SCHEMA-A files OR converting them to overrides — no half-state                                             |

---

## 10. Ticket recommendations for Priya to file

1. **SCRUM-XX1** — Promoter function + canonical TemplateConfig spec. Lock SCHEMA-A as canonical. Unit test against all 92 JSONs. (8 pts)
2. **SCRUM-XX2** — Boot-time registry seed: walk both config dirs, dedupe by `template_id`, populate `Template` collection. Add startup log "Loaded N templates from disk." (5 pts)
3. **SCRUM-XX3** — Extend `DynamicFormRenderer` with `file`, `currency`, `validation.regex` support; swap bespoke validators for `react-hook-form` + `zod`. (8 pts)
4. **SCRUM-XX4** — Scaffold script `scripts/scaffold-prompt-template.ts {docType}` — emits an override `/docs/templates/{id}.json` from a document-rule for engineer-driven hand-tuning. (3 pts)
5. **SCRUM-XX5** — Migrate the 6 production templates onto the promoter path with golden-PDF diff gate. (8 pts)
6. **SCRUM-XX6** — Smoke-test top-10 revenue-driver templates end-to-end on demo.lawie.in. (5 pts)

---

## Appendix A — files and line references

- `apps/drafting/src/services/template-engine.service.ts:147` — `loadTemplateConfig()`
- `apps/drafting/src/services/template-engine.service.ts:163` — `listTemplateConfigs()`
- `apps/drafting/src/services/template-engine.service.ts:409` — `buildPlaceholderContext()`
- `apps/drafting/src/services/template-engine.service.ts:663` — `buildAISystemPrompt()`
- `apps/drafting/src/services/template-engine.service.ts:1062` — `validateFormData()`
- `apps/drafting/src/services/prompt-assembler.ts:124` — `resolveDocRule()` (the SCHEMA-B path — slated for deprecation after Sprint 2)
- `apps/drafting/src/models/Template.model.ts` — DB cache; rewrite as read-through in Sprint 1
- `apps/web/src/components/form/DynamicFormRenderer.tsx` — generic form renderer (already exists)
- `apps/web/src/app/dashboard/new/page.tsx` — generic new-document flow (already exists)
- `apps/web/src/app/dashboard/templates/page.tsx` — generic template browser (already exists)
- `apps/drafting/src/config/document-rules/*.json` — 92 CLO-authored docs (SCHEMA-B, source of truth post-migration)
- `docs/templates/*.json` — 6 SCHEMA-A overrides (collapse to overrides-only in Sprint 2)

---

**Decision needed from founder:** sign-off on the promoter-not-merge approach + Sprint 1 ticketing.
