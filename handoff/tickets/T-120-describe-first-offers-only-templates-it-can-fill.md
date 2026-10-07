# T-120 — Describe-first only offers templates it can fill

| Field      | Value                                                                                 |
| ---------- | ------------------------------------------------------------------------------------- |
| Phase      | 1 — Describe-first intake                                                             |
| Owner      | Vishal, Arjun reviews                                                                 |
| Mode       | Full chain                                                                            |
| Status     | Closed on 5 Oct 2026, not built. ADR-021 is approved: there are no per-document forms |
| Depends on | None                                                                                  |
| Branch     | fix/t-120-intake-catalogue-usable-templates                                           |
| Created    | 2026-10-05                                                                            |

## Goal

A description is never matched to a template that has no form fields, and a draft can never be generated from an empty review screen.

## Context

- Finding 2 of the end-to-end check, `handoff/manual-checks/T-103-T-104-e2e-result.md`.
- Text: "Need a notice for my client about money he is owed by a company." Chosen: Legal Notice — Breach of Contract. The review screen showed "0 needs input, 0 to confirm, 0 ready" with Generate document enabled.
- `GET /documents/template-configs/legal_notice_breach_of_contract` returns 1 step with 0 fields. `bail_regular` returns 3 steps with 17 fields.
- Only 6 of the 92 configs in `apps/drafting/src/config/document-rules/` have `form_schema.steps` with fields: `bail_anticipatory`, `bail_regular`, `consumer_complaint`, `legal_notice_s138`, `legal_notice_s80`, `rent_agreement`. 76 use a grouped shape (for example `sender`, `recipient`, `contract`) and 10 use a list.
- `getCatalogue()` in `intake.service.ts` returns all 92. Vishal noted in T-101 that a narrower list is one filter there.

## Acceptance criteria

- `getCatalogue()` returns only templates whose config gives at least one field the user can fill. Today that is the 6 above. The rule is computed from the config, not a hard-coded list.
- A description that fits one of the other 86 goes to the no-match screen, and the demand signal is still saved, so we can see which templates people ask for.
- "Which document do you need?" offers only templates from that catalogue.
- The review screen cannot enable Generate document when the template has no fields.
- The server refuses `generate-from-template` for a template with no fields when the request carries an `intake_id`.
- A test fails if a template with no fields enters the catalogue.
- **Check and report, do not fix here:** open one of the 86 templates from the gallery (the old flow). If its form is also empty and it can be generated, write that in this file. That is a wider gap than describe-first and needs its own ticket.

## In scope

- `apps/drafting/src/services/intake.service.ts`
- `apps/drafting/src/routes/documents.routes.ts` (the refusal only)
- `apps/web/src/app/dashboard/new/page.tsx` and the review screen (the disabled Generate)

## Out of scope

- Converting the 86 configs to the shape the form reads. That is content work for Ajay and Priya and needs its own ticket and a founder decision on the order.
- Any prompt text

## References

- Design: Not needed
- ADR: `docs/adr/ADR-019-intake-and-routing.md`, section 3.4
- Legal sign-off: Not needed, as long as no prompt text and no document-rules file changes
