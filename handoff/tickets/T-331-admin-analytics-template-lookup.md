# T-331 — Admin document analytics: template lookup never matches

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (build, drafting admin) |
| Mode   | Small fix |
| Status | Merged into develop_staging d1b4372 (mahak, 12 Oct 2026). Waiting for Anushka on develop |

`/admin/documents/analytics` looks up `Template` by `Template.templateId`, which is a string slug. But `LawieDocument.templateId` is an ObjectId, so for real documents the lookup probably never matches, and the page shows ids instead of template names.

## Acceptance criteria

1. The analytics lookup joins on the right key, so real documents show their template names.
2. A test with a real-shaped document shows the name, not the id.
3. No document content in logs.

## Ruling (Priya, 12 Oct 2026)

No code path writes `LawieDocument.templateId`, so a join-key fix changes nothing for real data. Option A: template usage comes from `Generation` (completed, non-fixture generations grouped by slug, distinct documents counted, finalisedRate from the documents, Template joined on the slug), all inside `admin-documents.routes.ts`, same response shape. AC1 now reads: real documents show their template names, sourced from generation records. Writing `templateId` on documents (and a backfill) is out of scope here.
