# T-300 — template-engine: client form keys can overwrite server-computed values

| Field  | Value |
| ------ | ----- |
| Phase  | 1 — Legal accuracy |
| Owner  | Arjun (scope: which keys are server-only). Ajay (signs). Mahak (build, same file as T-293) |
| Mode   | Small fix, legal content (template-engine) |
| Status | To do. Found by Mahak in T-293, 12 Oct 2026. After T-293 merges |

In `apps/drafting/src/services/template-engine.service.ts`, `buildPlaceholderContext` flattens the client's formData into the context after the server's own values, so any client key can overwrite a server-computed value (for example `advocate_name`, `current_date`, computed field ids). Same class of bug as T-293, wider.

## Acceptance criteria

1. Arjun lists which context keys are server-only (computed or from the user record) and which the form may set.
2. Server-only keys cannot be overwritten by client formData; a test per class of key.
3. Ajay signs the diff; moved golden snapshots go to him.

## Arjun (12 Oct 2026): which keys are server-only

Read `buildPlaceholderContext` (`template-engine.service.ts` ≈ l.942). The context is built in this order: system values → advocate values → computed fields → `__sections_charged_read` → **the whole of the client's `formData` flattened on top (so it overwrites everything above it)** → state/date clean-up → court block (overwrites its own keys) → `if (!ctx.x)` defaults → `governing_provision` ("a value already in the context wins") → aliases (set only if empty) → recursive `{token}` pass. A client key therefore wins over everything set before the flatten, and over every "only if empty" default after it.

**Server-only (a client `formData` key of this name is dropped before the flatten)**
1. **System and profile:** `current_date`, `current_year`, `advocate_name`, `enrollment_number`.
2. **Internal:** the key behind `SECTIONS_CHARGED_READ_KEY` (`__sections_charged_read`) and **every key that starts with `__`** (reserved prefix). A client that sets `__sections_charged_read` today replaces the server's own read of the sections and defeats the T-277 labelling and old-law handling. Highest priority of the list.
3. **Computed fields:** every key `resolveComputedFields(config, formData, courtData)` returns for this template (the ids in the template's computed-field definitions). The set is per template and is derived at run time, not hard-coded.
4. **Court-derived:** `court_city`, `court_header`, `court_designation`, `case_nomenclature`, `state_respondent`, `party_label_petitioner`, `party_label_respondent`, `party_label_applicant`, `party_label_accused`, `party_label_petitioner_upper`, `party_label_respondent_upper`, `prayer_opening`, `prayer_closing`, `verification_text`, and any other key the court-rule block or `applyCourtAndAliases` sets. They are only half-protected today: the court block overwrites them when a rule exists, but the `if (!ctx.x)` defaults let a client value stand when no rule exists.
5. **Legal provisions:** `governing_provision` (the T-251 rule says a value already in the context wins; that is meant for T-245a's server-side value, never for the client), and the `custody_clause` and `jail` outputs if they are set by code rather than by a declared form field (Mahak checks).
6. **Deferred and alias keys:** the camelCase aliases in `PLACEHOLDER_ALIASES` (`caseNomenclature` and the rest) and the deferred tokens (`body_para_count`). An alias is skipped when already set, so a client alias value would stand.

**The form may set:** every `field_id` declared in the template's own `form_schema` (`config.form_schema.steps[].fields[].field_id`), plus the non-context keys the routes already carry for their own use (`template_id`, `source`, run and intake ids), which never reach the template text. Everything the user types about the case stays in this group (names, dates, facts, `police_station`, `sections_charged`, `state`, and so on).

**How to build it**
- In the flatten loop, skip any key in the server-only set (computed above, plus the fixed lists 1, 2, 4, 5, 6 and the `__` prefix). Skip, do not throw: a draft is not refused for it.
- Log one `warn` per request that dropped a key, with the **key names and the template id only, never the values**, so a probing client is visible.
- **Collision check, run once now:** grep every template and rule pack for a declared `field_id` that equals a server-only key (for example a form field literally called `current_date`). Any hit is a template bug: list it for Ajay, do not silently change the field. If a declared field must feed a server-only key, the server reads it from `formData` explicitly (as `resolveComputedFields` already does), not through the flatten.
- Do not switch to an allowlist-only rule in this ticket (a declared-field-only flatten would drop legitimate route keys); note it as a possible follow-up.

**Tests (a per class, AC2):** a client `current_date`, `advocate_name`, `enrollment_number`, `__sections_charged_read` (with a forged value: assert the labels come from the real sections), `party_label_petitioner` (no court rule), `governing_provision`, `caseNomenclature` and one computed id from a real template each leave the output unchanged against the same request without the key; a declared field such as `police_station` still flows; the `warn` carries the key names and no value. Moved golden snapshots: none expected; if any move, they go to Ajay as listed.

**Order:** after T-293 (same file). Mahak builds, Ajay signs the diff.

## Added (Priya, 12 Oct 2026, from Mahak's Explore)

- `advocate_name`, `court_designation` and `jail` are declared form fields in many packs; Arjun and Ajay rule whether the form may set them.
- `annexures.service.ts` prefers `formData.advocate_name`.
- The legacy `/generate` route takes `advocateName` from the request body over the profile (`documents.routes.ts` about lines 549 and 1429). Same class of bug; Arjun decides if it is in T-300.

## Arjun (12 Oct 2026): ruling on Mahak's Explore (declared fields) and the legacy route

Mahak's proposal is right and replaces my "skip every server-only key" rule. **The rule is now two lists:**

**A. Never client-settable, even if a template declares the field** (the key is dropped from `formData` before the flatten, and a declaration of one of these is a template bug listed for Ajay):
`__*` (reserved prefix, includes the `__sections_charged_read` key), `current_date`, `current_year`, `enrollment_number`, `governing_provision`, `custody_clause`, and the court-rule outputs `party_label_*` (all, with `_upper`), `state_respondent`, `case_nomenclature`, `prayer_opening`, `prayer_closing`, `verification_text`, the camelCase aliases in `PLACEHOLDER_ALIASES`, and the deferred token `body_para_count`.

**B. Server-set unless this template declares the field.** If the key is a `field_id` in **this template's** `form_schema`, the client value is accepted (it is what the user typed); if not, it is dropped. In this group: `advocate_name`, `court_designation`, `court_header`, `court_city`, `jail`, and every computed id (a computed id is never declared by its own template, so it stays server-only in practice).
- `advocate_name`: a declared, non-empty value wins; empty or absent falls back to the profile name. Put it in **one helper** `resolveAdvocateName(formData, profile)` that the placeholder context **and** `annexures.service` both call, so the draft and the annexures can never disagree (Mahak's finding 1).
- `court_designation`: stays settable where a pack declares it. It is only the fallback: when a court is chosen from the list the court-rule block keeps overwriting it, as today.
- `jail`: client-settable where declared (`bail_before_magistrate`); `custody_clause` is code-only (list A).

**Why `enrollment_number` is list A and `advocate_name` is not:** a name is what the user chooses to print on their own draft. The enrolment number is their Bar Council identity from the account; no form may set it, or one user could print another advocate's registration on a filing.

**`governing_provision` and the T-251 tests.** The tests that pass it in `formData` change; that was a shortcut, not a feature. Add `extra.governingProvision` to `buildPlaceholderContext` (a server-side parameter), have the tests pass it there, and T-245a will compute it from the declared `procedure_code` and pass it the same way. `GOVERNING_PROVISION_BLANK` stays the default. Mahak lists the changed tests for Ajay.

**Legacy `/generate` (Priya's question): in scope, same class.** `documents.routes.ts` (≈ l.549 and ≈ l.1429): the body's `advocateName` is accepted as the typed name only if, after trim, it is 1 to 100 characters with no `{`, `}` or line breaks; otherwise the profile name is used. The body's `enrollmentNumber` is **ignored**: the number always comes from the profile. Both call sites use the same helper. A body value that fails the check does not refuse the request.

**Collision check (unchanged):** a pack that declares a list-A key is reported to Ajay, not changed. The 57 packs that declare `advocate_name` are expected and fine.

**Tests:** as before (one per class), plus: `advocate_name` declared and typed → used by the draft **and** the annexures; empty → profile in both; `enrollment_number` in `formData` and in the legacy body → profile wins; legacy `advocateName` with `{x}` or a line break → profile name; `court_designation` declared with no court chosen → the typed value; with a court chosen → the court's.
