# T-331 — Admin document analytics: template lookup never matches

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (build, drafting admin) |
| Mode   | Small fix |
| Status | Building: mahak (12 Oct 2026), while T-223 waits on T-343 and T-351 |

`/admin/documents/analytics` looks up `Template` by `Template.templateId`, which is a string slug. But `LawieDocument.templateId` is an ObjectId, so for real documents the lookup probably never matches, and the page shows ids instead of template names.

## Acceptance criteria

1. The analytics lookup joins on the right key, so real documents show their template names.
2. A test with a real-shaped document shows the name, not the id.
3. No document content in logs.
