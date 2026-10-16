# T-486: In default bail, "No" on the bail-bonds question must remove the undertaking

| Field  | Value                                                                                                          |
| ------ | -------------------------------------------------------------------------------------------------------------- |
| Status | To do. V1 (split from T-481 on 16 Oct 2026). Priya                                                             |
| Owner  | Lead who is free once T-471, T-472 and T-475 have landed (files held by Vishal and Mahak); Ajay signs the text |
| Mode   | Full chain (legal content)                                                                                     |

## Source

Anushka run 4: the "No" chip on the bail-bonds question could not be selected (web, fixed in T-481a) and the draft prints "11. That the applicant undertakes to furnish bail bonds ..." regardless. Ajay's ruling (T-245 file 5bc76d1a): Yes -> existing undertaking unchanged. Not answered -> "That the applicant [To be confirmed: whether the applicant is prepared to furnish bail and bonds as directed by this Hon'ble Court]." No -> no undertaking (post-check strips it), plus an in-app note, not in the draft: "Default bail under Section 187(3) BNSS is available only if the accused is prepared to furnish bail. Check this before filing."

## What (Tanvi's Explore, 16 Oct)

1. intake-brief.ts buildBrief marks a declined "No" as asked_empty (today it drops "No" as null, so No equals not answered) and carries the in-app note.
2. A conditional instruction in ai.service.ts statedInstructions plus a post-check after the citation pass (needs brief-drafter.ts).
3. default_bail.json instruction 9 and the \_skeletons file: a `when` on the willingness clause, a re-signed skeleton markdown and new SHA pins. The t251 and t373 tests flip.
4. The web side shows the in-app note.

## Acceptance criteria

- Yes, not answered and No each give exactly the text above; the post-check strips any model sentence of the undertaking on No.
- Ajay byte-checks the pack text and re-signs the skeleton; moved tests explained to him.

## Files held by others (claim after they merge)

intake-brief.ts (Vishal T-471 field), ai.service.ts (Vishal T-471, Mahak T-472), brief-drafter.ts (Mahak T-475/T-472).
