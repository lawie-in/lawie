# T-363 — s.138: the 30-day warning, dates in words, and the notice wording

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (drafting) + Ajay (notice wording) |
| Mode   | Full chain |
| Status | To do. RELEASE GATE for main (Anushka FAIL). Unassigned. Priya, 13 Oct 2026 |
| Source | Anushka run 3 FAIL, 13 Oct 2026 (handoff/quality/2026-10-13-run-3-develop-FAIL.md). Failed entries: T-192 |

## Acceptance criteria

1. Return memo received 15 Sep 2026 and notice sent 30 Oct 2026: the brief warns that the notice is outside 30 days and asks the advocate to confirm before continuing.
2. Dates given in words in the description ("fifteenth September") fill the memo-received and notice date fields.
3. The notice never says the offence is complete when the cheque is issued. It says what Ajay signs: the offence arises on non-payment within 15 days of receiving the notice.
4. The notice invents nothing ("the account did not exist" only if given). It keeps the proprietor and the payee's address when given.
5. Golden-set cases for 1, 3 and 4.

Anushka's reproduce steps are in the run 3 report; use them as the test cases. Anushka re-tests on develop after merge.
