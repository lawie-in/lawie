# T-690: The written statement para-2 placeholder states the law wrongly (legal content)

Status: waiting on Ajay's signed line, raised 29 Oct 2026 (Anushka run 5e, via Arjun)
Priority: P2. Legal content: Ajay writes the line, and a lead replaces the string byte for byte.

## Problem
Paragraph 2 of the written statement prints the placeholder "(must be within 30; extendable to 120 in non-commercial, max 120 in commercial)". This states the filing time limit wrongly.

## Acceptance criteria
1. Ajay supplies the replacement text, signed.
2. A lead replaces the string exactly, in the pack or template where it lives (a legal-content path).
3. Ajay byte-checks the merged SHA.

## Ajay's ruling (29 Oct 2026; already signed as T-681 item 4 in the run5 rulings, pointer 1b7b0d03)
- The line, exact: "Days from service of summons (due within 30; the court may allow up to 90 for recorded reasons; 120 is the outer limit in a commercial suit)"
- Swap all 4 places in that table in one commit, because they state the same rule.
- Snapshots are hand-edited, and the diff is sent to Ajay.
- Ajay checks the branch SHA before the merge, as well as the merged SHA.
Status: ready to assign (small fix).
