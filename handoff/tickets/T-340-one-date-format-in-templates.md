# T-340 — One date format in every template: "4 April 2026"

| Field  | Value |
| ------ | ----- |
| Phase  | 1 — Describe and draft |
| Owner  | Ajay (format, signs). Lead (build, drafting) |
| Mode   | Small fix (legal content) |
| Status | Building: tanvi, with T-345 (12 Oct 2026) |

Ajay's third T-192 ruling: dates in drafts print as "4 April 2026". T-192 shipped without it because the template engine was claimed for T-240.

## Acceptance criteria

1. In `apps/drafting/src/services/template-engine.service.ts`, `current_date` and every ISO date (`YYYY-MM-DD`) rendered into any template print as `D Month YYYY`: day without a leading zero, full English month name (e.g. "4 April 2026").
2. Applies to all templates, not only `legal_notice_s138`.
3. Tests cover current_date, an ISO input, and a single-digit day. Any golden snapshot that moves is shown to Ajay before merge.
