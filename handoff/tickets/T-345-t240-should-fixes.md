# T-345 — T-240 reviewer's should-fixes

| Field  | Value |
| ------ | ----- |
| Phase  | 1 — Describe and draft |
| Owner  | Lead (drafting) |
| Mode   | Small fix |
| Status | To do. After T-240 merges. Raised by Tanvi's T-240 reviewer, 12 Oct 2026 |

## Acceptance criteria

1. Override catalogue ids are validated at boot; an unknown id fails loudly. The try/catch in `listTemplateConfigs` only catches what it should.
2. In `template-promoter.ts`, the catalogue check runs (today it is unreachable behind the price check).
3. The stale `credits.service` comment in the promoter is fixed.
4. The intake fallback label shows a readable name, not raw underscores.
5. Tests for 1, 2 and 4.
