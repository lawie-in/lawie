# T-363 — s.138: the 30-day warning, dates in words, and the notice wording

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (drafting) + Ajay (notice wording) |
| Mode   | Full chain |
| Status | Merged into develop_staging 7f99f96 (shashank, 13 Oct 2026). Ajay approved. Waiting for Anushka on develop. Fixtures 19-21 follow T-373. Priya |
| Source | Anushka run 3 FAIL, 13 Oct 2026 (handoff/quality/2026-10-13-run-3-develop-FAIL.md). Failed entries: T-192 |

## Acceptance criteria

1. Return memo received 15 Sep 2026 and notice sent 30 Oct 2026: the brief warns that the notice is outside 30 days and asks the advocate to confirm before continuing.
2. Dates given in words in the description ("fifteenth September") fill the memo-received and notice date fields.
3. The notice never says the offence is complete when the cheque is issued. It says what Ajay signs: the offence arises on non-payment within 15 days of receiving the notice.
4. The notice invents nothing ("the account did not exist" only if given). It keeps the proprietor and the payee's address when given.
5. Golden-set cases for 1, 3 and 4.

Anushka's reproduce steps are in the run 3 report; use them as the test cases. Anushka re-tests on develop after merge.

## Ajay (13 Oct 2026)

Ajay signed (dff323f, handoff/legal/). The only liability line: the offence is complete on non-payment within 15 days of receipt of the notice. Show his B2 warning with a "Continue with these dates" confirm. Invent nothing from the memo.

## Arjun (13 Oct 2026)

Build this now, on today's path. The date checks and the 30-day warning are code and stay. Ajay's notice wording goes into the pack now, and becomes the s.138 skeleton text when that pack moves to D1.

## Regression fix (Shashank, 13 Oct 2026)

On the brief path, formDataFromBrief fills the empty optional `drawer_proprietor` with its "[To be confirmed: …]" placeholder. The twin's computed fields test for `''`, so every s.138 notice without a proprietor printed a placeholder proprietor block in the header, and `payee_client` broke the same way in the subject line. Fix on fix/t-363-proprietor-placeholder: the two computed fields treat the placeholder as empty, the same as notice_date already does, with no wording change. Tests on the brief path. Files: docs/templates/legal_notice_s138.json and t363-s138-notice.test.ts. Full chain, and Ajay sees the twin diff.
