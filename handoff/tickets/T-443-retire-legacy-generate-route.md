# T-443: retire the legacy POST /documents/generate route

| Field  | Value                                                                  |
| ------ | ---------------------------------------------------------------------- |
| Status | Merged into develop_staging cc2adc0 (Mahak, 15 Oct 2026). Priya |
| Owner  | Mahak (build), Arjun (ruled)                                           |
| Mode   | Small fix (drafting only)                                              |

Source: Arjun, 15 Oct 2026, from Vishal's T-245a finding. `POST /documents/generate` (apps/drafting/src/routes/documents.routes.ts ~1620-1720) is a reachable, Ink-charged route that nothing in web or the gateway calls any more. A direct API call with docType `bail_regular` reaches the legacy prompt, which says "NEVER reference old IPC, CrPC, or IEA", the opposite of Ajay's T-245a rule. A reachable route that can produce a wrong-law draft is a wrong-document bug whatever calls it.

## Acceptance criteria

1. `POST /documents/generate` returns `410 Gone` with a short JSON message, with no Ink hold, no Generation row, and nothing else. (T-375 already closed it for `plaint`.)
2. A test: 410 for every legacy docType including `bail_regular`, and no Generation row or hold is written.
3. The legacy prompt text and the `NON_TEMPLATE_PRICES` rows stay for now; they go in the post-v1 cleanup ticket (T-435).

## Out of scope

Deleting prompt-assembler's legacy path (T-435), and T-171 (prompt-assembler.ts:161, Tanvi).

Quality: nothing to test in the UI: API route only.
