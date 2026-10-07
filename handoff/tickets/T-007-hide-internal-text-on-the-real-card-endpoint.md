# T-007 — Hide internal text on the endpoint the cards really use

| Field      | Value                                  |
| ---------- | -------------------------------------- |
| Phase      | 0 — Prep                               |
| Owner      | Vishal                                 |
| Mode       | Small fix                              |
| Status     | Done                                   |
| Depends on | None                                   |
| Branch     | fix/t-007-template-config-descriptions |
| Created    | 2026-10-03                             |

## Goal

The cards on New document and Templates stop showing "Document-rules config for ...".

## Context

- T-002 cleaned the description in `GET /templates` (PR #30). The web app does not call that endpoint.
- Both pages call `/api/documents/template-configs`: `apps/web/src/app/dashboard/new/page.tsx` (line 177) and `apps/web/src/app/dashboard/templates/page.tsx` (line 69).
- That route is in `apps/drafting/src/routes/documents.routes.ts` and returns `listTemplateConfigs()` from `template-engine.service.ts`, with `description` as stored.
- PR #30 added a helper, `presentDescription`, in `templates.routes.ts`. It can be reused.

## Acceptance criteria

- On New document and on Templates, no card shows "Document-rules config for" or a raw template id. This is checked in the browser, with a screenshot of each page in the PR.
- The cleaned text is the part after the dash, first letter capitalised. Descriptions without the prefix are unchanged.
- The cleaning is applied in the `/documents/template-configs` list response and in `/documents/template-configs/:id`.
- `presentDescription` lives in one shared place and both routes use it.
- Search on New document still finds templates by name, description and id.
- A route test covers `/documents/template-configs` with one prefixed and one plain description.

## In scope

- `apps/drafting/src/routes/documents.routes.ts` (the two template-configs handlers)
- A small shared helper for `presentDescription`
- The matching test

## Out of scope

- Editing any file under `apps/drafting/src/config/document-rules/`
- Editing the template seed scripts
- Rewriting the descriptions themselves

## References

- Design: Not needed
- ADR: Not needed
- Legal sign-off: Not needed. No legal-content path is touched.

## Review, 3 Oct 2026

| Reviewer | Verdict  | Note                                                     |
| -------- | -------- | -------------------------------------------------------- |
| Priya    | Approved | Raised in review because T-002 fixed the wrong endpoint. |
| Arjun    | Approved | Small fix, one service.                                  |
