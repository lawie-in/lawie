# T-385 — Template detail routes send internal source notes to the browser

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (drafting) + Arjun |
| Mode   | Small fix |
| Status | To do. Unassigned. Found by Mahak in T-365 Explore, 13 Oct 2026 |
| Source | The detail routes return `_source`/`source` (prompt_context, clause notes) to the client |

## Acceptance criteria

1. The template detail routes send only what the web uses. No `_source`, `source`, prompt_context or clause notes reach the browser.
2. A test asserts that these fields are absent from the response.
3. Arjun confirms nothing in the web reads them.
