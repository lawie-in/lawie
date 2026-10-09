# T-176 — A family court heading names its seat, on both paths

| Field          | Value |
| -------------- | ----- |
| Phase          | 1 — Describe and draft |
| Owner          | Vishal |
| Mode           | Fix, full chain (developer + tester + reviewer + Ajay). Changes printed legal text. Must land before v1 GTM (AJ-2026-10-08-T174, item 1) |
| Status         | Merged to develop (PR #76), 8 Oct. Anushka tests on develop. |
| Size           | S (half day to one day) |
| Depends on     | T-174 (merged, PR #73). Cut from origin/develop (ef1716f) |
| Branch         | fix/t-176-family-court-seat-heading |
| Legal sign-off | Ajay signs every heading string this ticket prints (AC 1–5, 7), including "[To be confirmed: place]", and any golden diff (AC 8), before merge. Expected to be a code-only change (see "JSON edit?"). Any edit under a legal-content path (`config/court-rules/`, `config/courts/`, `config/document-rules/` ...): BLOCKED for Ajay, with the exact diff |
| Created        | 2026-10-08 |
| Source         | FU-1 of Ajay's ruling AJ-2026-10-08-T174 (items 1 and 3) |

## Problem

A family court draft's heading does not reliably name the court's seat.

- **Typed path.** `resolveCourtRule` (`prompt-assembler.ts`) now returns the `family_court` rule (T-174). `formatCauseTitle` (`post-processor.ts`) replaces the first heading line it matches with `courtRule.designation`, which is the bare "IN THE FAMILY COURT". So "Family Court, Patna" prints with no seat. If the LLM already wrote "IN THE FAMILY COURT AT PATNA", no pattern matches and the line stays as the LLM wrote it, so the result depends on the model.
- **List path.** `chosenCourtHeading` (`template-engine.service.ts`) prints "IN THE FAMILY COURT, DELHI" for Tis Hazari. It drops the list entry's own designation, "IN THE FAMILY COURT AT TIS HAZARI, DELHI". Ajay: not acceptable for v1.
- `family_court.json` has `formattingPreferences.causeListFormat` = "IN THE FAMILY COURT AT {place}". No code reads it today.

## User

District court advocate in Bihar, Jharkhand, UP or Delhi filing a family matter (maintenance under s.144 BNSS, divorce, custody). A heading without the seat has to be hand-corrected before filing, or the registry returns it.

## Solution

- One heading rule for family courts on both paths: name the seat.
- Typed path: take the seat from the typed court name and build the heading from `causeListFormat` ("IN THE FAMILY COURT AT {place}"). If no seat can be read, `{place}` prints "[To be confirmed: place]". Never guess a seat from the user's state, district, or anything else.
- List path: the courts-list entry's own designation prints as stored (as T-146-golden-2 fix 3 already does for other list designations).
- A heading the LLM already wrote with a seat is replaced by the built heading, so the output does not depend on the model.

### JSON edit?

No JSON edit is expected. `causeListFormat` already holds the pattern, and the four list entries (Patna, Lucknow, Ranchi, Tis Hazari) already carry "IN THE FAMILY COURT AT <seat>". This is code only. If the build turns out to need a JSON change (for example `{place}` to `{city}`, or a new key), stop: BLOCKED for Ajay with the exact diff. Do not make it in this ticket.

## Acceptance criteria

1. **Four launch cities, typed path.** For "Family Court, Patna", "Family Court, Lucknow", "Family Court, Ranchi" and "Family Court, Delhi", the rendered draft's first heading line names that seat in the `causeListFormat` form, e.g. "IN THE FAMILY COURT AT PATNA". Tested per city. The PR body pastes the exact line for each, for Ajay.
2. **Principal Judge / Additional Principal Judge.** "Principal Judge, Family Court, Lucknow" and "Additional Principal Judge, Family Court, Patna" each give a heading with the right seat (Lucknow, Patna). The judge title is never read as the seat ("AT PRINCIPAL JUDGE" never appears). Whether the heading also prints the judge title is Ajay's call: the PR body shows the exact line for both inputs and Ajay signs the form. Tested.
3. **Unknown seat.** "Family Court" and an empty name give "IN THE FAMILY COURT AT [To be confirmed: place]". No seat is filled from the user's state, profile or district. Tested with a Bihar user typing "Family Court": no "PATNA" in the heading.
4. **Heading the LLM already wrote.** When the LLM output's first heading line is "IN THE FAMILY COURT AT PATNA", "IN THE COURT OF THE PRINCIPAL JUDGE, FAMILY COURT, PATNA" or "BEFORE THE FAMILY COURT, PATNA", the final draft has exactly one heading line, built per AC 1/2, with the seat kept. A seat the LLM wrote that differs from the typed seat does not win: the typed seat prints. Tested with each input.
5. **List-path parity.** Tis Hazari picked from the list prints "IN THE FAMILY COURT AT TIS HAZARI, DELHI", as stored. Patna, Lucknow and Ranchi picked from the list print their stored designations. For each of the four, typed and listed give the same seat; the PR body pastes both lines side by side. Tested.
6. **No regression.** District, sessions, JMFC, High Court, Supreme Court and consumer headings are unchanged. Existing `post-processor`, `template-engine`, `prompt-assembler`, `t171-*` and `t174-*` tests pass unedited.
7. **Annexures.** The annexures pack (`chosenCourtHeading` caller in `annexures.service.ts`) prints the same family court heading as the main draft. Tested for Tis Hazari.
8. **Golden snapshots.** Run `court-rules-golden` and report pass or fail. If any snapshot changes, stop, do not update it, and send the diff to Ajay. Read `.claude/docs/golden-snapshots.md` first.
9. **Full suite green.** The full drafting suite passes, with counts reported. `@lawie/shared` is built first.

## Out of scope

- Family court case numbering per state, "M.J. No." (T-177, FU-2).
- `family_court.json` citation fix (Order VI Rule 17 to 16) and `courtType` label (T-178, FU-3).
- Consumer forum routing (`consumer_commission_generic`).
- Any edit to `family_court.json` or `indian-courts.json` strings beyond what Ajay signs.
- Family courts outside the four launch cities: they get the same code path, but only the four are tested and pasted for Ajay.

## What Ajay signs

Every heading line from AC 1–5 and 7, the "[To be confirmed: place]" placeholder, the Principal / Additional Principal Judge form (AC 2), and any golden diff (AC 8). Anushka's verdict is still required before merge.

## Files (expected)

`apps/drafting/src/services/post-processor.ts` (`formatCauseTitle`), `apps/drafting/src/services/template-engine.service.ts` (`courtHeading` / `chosenCourtHeading`), possibly `apps/drafting/src/services/prompt-assembler.ts` (passing the typed name through), one new test file (`apps/drafting/src/__tests__/t176-*.test.ts`). Reads `config/court-rules/family_court.json` and `config/courts/indian-courts.json`; does not edit them.
