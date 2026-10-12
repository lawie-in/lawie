# T-289 — Bail check: take the trial court from the First Schedule, not the maximum term (HIGH)

| Field          | Value |
| -------------- | ----- |
| Phase          | 1 — Legal accuracy |
| Owner          | Ajay (adds the "triable by" column to the signed table, signs). Shashank (build, after T-277: same files). Anushka |
| Mode           | Small fix, legal content |
| Status         | To do. HIGH. Raised by Ajay during T-277 round 4, 12 Oct 2026. Waits for T-277 and Ajay's signed column |

The bail check guesses the trial court from the maximum term ("3-7 years generally triable by Sessions"). That is wrong: most such offences are triable by a Magistrate. The court must come from the First Schedule's "triable by" column of BNSS, which Ajay will add to the signed BNS offence table.

## Acceptance criteria

1. Ajay adds a signed "triable by" value per BNS row to the offence table (the file T-277 installs). A row with no value stays unknown.
2. `bail-check.service.ts` reads the court only from that value. No rule derives the court from the term. Unknown shows Ajay's signed text ("Court level: Depends on the offence. Check the First Schedule."), never a guess.
3. Tests: one Magistrate-triable offence with a 3-7 year term shows Magistrate; one Sessions-triable offence shows Sessions; an unknown row shows the signed text.
4. Ajay signs the diff as applied; moved golden snapshots go to him.

## Gates

- Design: Not needed (no layout change)
- ADR: Not needed
- Legal sign-off: Ajay (the column and the diff)
