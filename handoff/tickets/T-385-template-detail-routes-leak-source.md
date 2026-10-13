# T-385 — Template detail routes send internal source notes to the browser

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (drafting) + Arjun |
| Mode   | Small fix |
| Status | Building. Mahak, after T-365. Priya, 13 Oct 2026 |
| Source | The detail routes return `_source`/`source` (prompt_context, clause notes) to the client |

## Acceptance criteria

1. The template detail routes send only what the web uses. No `_source`, `source`, prompt_context or clause notes reach the browser.
2. A test asserts that these fields are absent from the response.
3. Arjun confirms nothing in the web reads them.

## Arjun (13 Oct 2026)

Confirmed: nothing in the web reads pack-level `_source`, `prompt_context` or clause notes. Strip them from both template detail routes. Keep the field-level `source` key inside `form_schema` (`courts_db.*`, `bns_mapping`): DynamicFormRenderer reads it.
