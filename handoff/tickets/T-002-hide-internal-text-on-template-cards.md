# T-002 — Hide internal text on template cards

| Field      | Value                        |
| ---------- | ---------------------------- |
| Phase      | 0 — Prep                     |
| Owner      | Vishal                       |
| Mode       | Small fix                    |
| Status     | Done                         |
| Depends on | T-001                        |
| Branch     | fix/t-002-template-card-text |
| Created    | 2026-10-03                   |

## Goal

Template cards show a plain description, not internal config text.

## Context

- 72 of the 92 files in `apps/drafting/src/config/document-rules/` have a `description` that starts with "Document-rules config for <template id> — ".
- Users see that text on the cards in New document and Templates. Example: "Document-rules config for affidavit_identity — standalone affidavit of identity for KYC, bank, property, government use".
- `GET /templates` in `apps/drafting/src/routes/templates.routes.ts` returns `description` as stored.
- The JSON files and the seed scripts are legal content and need Ajay sign-off to edit, so this fix stays in the API response.

## Acceptance criteria

- No card on New document or Templates shows "Document-rules config for" or a raw template id.
- The card shows the text after the dash with the first letter capitalised. Example: "Standalone affidavit of identity for KYC, bank, property, government use".
- Descriptions without the prefix are returned unchanged.
- The fix is in the `GET /templates` and `GET /templates/:slug` responses, so both pages get it.
- Search by name, description or id still works.
- A test covers one description with the prefix and one without.

## In scope

- `apps/drafting/src/routes/templates.routes.ts` and its test

## Out of scope

- Editing any file under `apps/drafting/src/config/document-rules/`
- Editing the template seed scripts
- Rewriting the descriptions themselves (see open question)

## References

- Design: Not needed
- ADR: Not needed
- Legal sign-off: Not needed. No legal-content path is touched.

## Open questions

- Follow-up for Ajay and Madhuri: rewrite the 72 descriptions properly in the JSON files. That needs Ajay sign-off and a re-seed.

## Review, 3 Oct 2026

| Reviewer | Verdict      | Note                                                                                                                                                                                                                                                                               |
| -------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Priya    | Goal not met | The acceptance criteria were met and PR #30 is merged, but the cards are unchanged. The web app never calls `GET /templates`. New document and Templates both call `/api/documents/template-configs`. The ticket named the wrong endpoint, which was my error. Follow-up is T-007. |
| Arjun    | Agrees       | The helper `presentDescription` from PR #30 can be reused in T-007.                                                                                                                                                                                                                |
