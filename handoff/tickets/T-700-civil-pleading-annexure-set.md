# T-700: Civil pleadings get their own annexure set

Status: ASSIGNED vishal 30 Oct 2026 (v1.3.0, full chain). Was: backlog, P1, the v1.3.0 headline (legal; Ajay ruled AJ-700 acb308d9; ready to assign next session). Raised 30 Oct 2026 by Priya from Anushka run 5h on prod v1.2.9 (FAIL, pre-existing). Folds in T-689d.

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

## Ajay AJ-700 (acb308d9), 30 Oct 2026
0. The criminal annexure set goes to criminal packs only.
1. Pleadings (written statement, replication, plaints):
   - Memo of Parties in Plaintiff/Defendant roles;
   - List of Dates from the brief's dates only;
   - an Index with a list of documents (O.VII R.14 / O.VIII R.1A CPC);
   - a VERIFICATION under O.VI R.15 by the party in its own role, naming "the above written statement" (or the right document). The commercial statement of truth is held as "verify".
2. "Nature of matter" goes on the first line of the Index, for every court document.
3. Other civil documents:
   - O.39 gets an affidavit in support by the plaintiff/applicant;
   - counter and rejoinder affidavits get no separate affidavit;
   - all other civil packs get Memo of Parties plus Index only.
The tests are in Ajay's ruling row. Snapshots are hand-edited, with the diff sent to Ajay.
