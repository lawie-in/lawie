# T-385 — Template detail routes send internal source notes to the browser

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (drafting) + Arjun |
| Mode   | Small fix |
| Status | Merged into develop_staging 68937a7 (Mahak, 13 Oct 2026). Nothing to test in the UI. Priya |
| Source | The detail routes return `_source`/`source` (prompt_context, clause notes) to the client |

## Acceptance criteria

1. The template detail routes send only what the web uses. No `_source`, `source`, prompt_context or clause notes reach the browser.
2. A test asserts that these fields are absent from the response.
3. Arjun confirms nothing in the web reads them.

## Arjun (13 Oct 2026)

Confirmed: nothing in the web reads pack-level `_source`, `prompt_context` or clause notes. Strip them from both template detail routes. Keep the field-level `source` key inside `form_schema` (`courts_db.*`, `bns_mapping`): DynamicFormRenderer reads it.

## Arjun (13 Oct 2026): projection rulings

1. Allowlist projection for `GET /documents/template-configs/:id` as proposed: identity keys, `description` (the card line, from `card_description`), `supported_languages`, `plan_access`, `catalogueCategory`, and `form_schema.steps[].fields[]` with the renderer's field keys only. `document_structure`, `computed_fields`, `validation_rules`, `metadata`, `_source` all drop. One shared projection helper, used by every template-facing route. Tests: (a) the projected object has no key outside the allowlist, recursively; (b) the web form renderer's existing tests pass against a projected config.
2. `GET /templates/:slug` has no caller: remove the route. `GET /templates` (list) stays, trimmed to the card keys through the same helper.
3. Field-level `source` not promoted from rule packs (bail_anticipatory declares `bns_mapping`, the renderer never sees it): a real bug on a v1 pack. Priya logs it as its own ticket, next after T-365 for whoever is free; not in T-385.
4. The list route's `metadata` (created_by, reviewed_at): trim it in T-385, same helper.

## Arjun (13 Oct 2026)

T-385 removes `GET /templates/:slug`, which has no caller. The template-configs detail route sends an allowlist projection (Mahak's proposal). Field-level `source` reaching the form is T-394.

## Added (Priya, 13 Oct 2026, from Tanvi's T-375 review)

GET /templates (gateway /api/templates) still lists the six plaint rows from Mongo while `feature.template_civil_plaint` is off. After T-375 merges, apply the same filter using `hiddenTemplateIds` / `isTemplateEnabled` from feature-switches.ts. `/templates/:slug` is removed in this ticket anyway. Add a test.
