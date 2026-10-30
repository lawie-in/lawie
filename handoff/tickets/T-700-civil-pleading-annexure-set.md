# T-700: Civil pleadings get their own annexure set

Status: backlog, P1, the v1.3.0 headline (legal; waiting on Ajay AJ-700). Raised 30 Oct 2026 by Priya from Anushka run 5h on prod v1.2.9 (FAIL, pre-existing). Folds in T-689d.

## What is wrong
annexures.service.ts builds one annexure set for every pack, and it is the criminal-bail set. Now that a written statement no longer gets the Synopsis (T-689c), the rest is visible:
- Memo of Parties says "Applicant Prakash Gowda / Respondent ___".
- List of Dates has FIR and arrest lines, and none of the brief's dates.
- The Index lists "Copy of FIR".
- The Affidavit says "Applicant/Petitioner… paragraphs 1 to 39 of the above petition".
- Major: "Nature of matter" was only ever printed in the Synopsis, so a WS pack now has no such line.

No rollback: v1.2.8 had the same pack plus a wrong Synopsis.

## Gate
Ajay rules (AJ-700) on the annexure set for a WS or suit:
- Memo of Parties as Plaintiff/Defendant;
- List of Dates taken from the brief;
- an Index without FIR items;
- an Affidavit in the deponent's own role;
- where "Nature of matter" goes when there is no Synopsis.

## Acceptance criteria (after Ajay)
1. A written statement's annexures use the civil set Ajay rules, byte for byte.
2. Anushka's ask: check the other civil documents too (replication, plaint/suit, O.39 application, counter affidavit). Each gets the right set or is listed for a follow-up.
3. T-689d is included: one court-type helper for all annexures, including the court fee.
4. Golden snapshots change only as Ajay allows. Ajay byte-checks the final SHA.
