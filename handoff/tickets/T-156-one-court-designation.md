# T-156 — One court, one designation across the document

| Field          | Value |
| -------------- | ----- |
| Phase          | 1 — Describe and draft. MUST FIX before go-live |
| Owner          | Vishal (build), Anushka (tests develop after the batch) |
| Mode           | Fix, full chain. Merge to develop per founder's 8 Oct rule (as relayed by Vishal); Anushka tests the batch on develop |
| Status         | Merged to develop (PR #65), 8 Oct. Anushka tests on develop. |
| Size           | S–M (1 day) |
| Depends on     | T-146 (merged: `court_header` / `court_designation` from the courts list) |
| Branch         | fix/t-156-one-court-designation |
| Legal sign-off | NOT NEEDED, unless a golden snapshot changes (see below) |
| Created        | 2026-10-08 |
| Source         | Board T-156 note: annexure headings print the court-rules designation line, not the chosen court (`annexures.service.ts` `resolveCourtRules`) |

## Goal

A document names its court one way. Once a court is chosen, the petition, the cause title and every annexure print that court's `court_header`, never the court-rules designation line.

## Problem

A sessions bail matter with a court chosen from the courts list (e.g. Sessions Court, Gaya; or a Mumbai sessions court). The petition heading reads the chosen court (T-146). The annexures pack (Memo of Parties, Synopsis, Vakalatnama, Court Fee Statement, Affidavit) prints the court-rules line instead, e.g. "IN THE COURT OF SESSIONS JUDGE" or a generic "SESSIONS JUDGE / ADDITIONAL SESSIONS JUDGE". Same matter, two court names. An advocate filing this looks careless before a judge reads a word.

## Known state (Priya, from a read of develop cecae06, not reproduced)

- `annexures.service.ts`: `buildAnnexuresPack` calls `resolveCourtRules(formData)`, which loads a court-rules file by `court_id` / `court_rules_id` or derives one from `court_type` + `state`, and falls back to "IN THE COURT OF THE DISTRICT JUDGE". All five headed annexures print `rules.designation`.
- `deriveCourtRulesId` has no Maharashtra branch, so a Mumbai sessions matter likely lands on `sessions_generic` — a generic, choice-style designation.
- `template-engine.service.ts`: `applyCourtAndAliases` / `courtHeading` already compute the chosen court's `court_header` and `court_designation` for the draft. The annexures path does not use them.
- `routes/documents.routes.ts` (~1459) passes only `doc.formInputs` to the pack. Whether the chosen court's id is in `formInputs` is not verified — developer confirms.

## Acceptance criteria

1. With a court chosen, every annexure heading prints exactly the draft's `court_header` for that court (same string the petition prints). No court-rules designation line appears anywhere in the pack.
2. Gaya scenario (Sessions Court, Gaya; bail): petition heading, cause title, Memo of Parties, Synopsis, Vakalatnama, Court Fee Statement and Affidavit headings all show the same court name. "IN THE COURT OF SESSIONS JUDGE" and any "X / Y" choice text do not appear.
3. Same as 2 for a Mumbai sessions court.
4. The heading is computed in one place (reuse `courtHeading` or equivalent) — not a second copy of the rule in `annexures.service.ts`.
5. No court chosen: behaviour unchanged from today (court-rules designation, then the existing fallback). A test pins this.
6. Party labels, verification wording and court-fee text in the annexures still come from the court rule, unchanged (T-149 rules kept).
7. Tests: unit tests in `__tests__/annexures.test.ts` for 1, 2, 3 and 5 (headings asserted on the rendered HTML, not the PDF). Golden snapshots run and are not auto-updated.
8. Report states whether any golden snapshot changed. Expected: none.

## Out of scope

- Any change to `config/court-rules/*.json`, `config/courts/`, or golden snapshots. Needs Ajay; not part of this ticket.
- Adding a Maharashtra branch to `deriveCourtRulesId`.
- Annexure content, order, or which annexures are included.
- Verification wording, party designations, court-fee rules.
- "S/o" in the verification (T-159).

## Legal-content check

- `apps/drafting/src/services/annexures.service.ts`, `template-engine.service.ts` and `routes/documents.routes.ts` are NOT legal-content paths (`.claude/docs/legal-content-paths.md`). The fix is a wiring change: annexures print a heading the draft already prints.
- If the fix needs any file under a legal-content path, stop and return BLOCKED.

## What Ajay must look at

- Nothing, if no golden snapshot changes.
- If a golden snapshot diff appears: only that diff. It goes to Ajay before merge; the tester never updates it.

## Files (expected)

`services/annexures.service.ts`, possibly `routes/documents.routes.ts` (to pass the chosen court) and an export from `services/template-engine.service.ts`, `__tests__/annexures.test.ts`. Must NOT touch `intake-brief.ts`, `intake.prompts.ts`, or any `config/` file.
