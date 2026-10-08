# T-139 — Do not ask again for what I already gave

| Field          | Value |
| -------------- | ----- |
| Phase          | 1 — Describe and draft. MUST FIX before go-live (Major, Anushka run 1) |
| Owner          | Priya (scope), Ajay (the questions + sign-off), Vishal (build), Anushka (tests develop after the batch) |
| Mode           | Fix, full chain. Trace the cause first and report it before changing prompts. Merge to develop per founder's 8 Oct rule (as relayed by Vishal) |
| Status         | Ready for Vishal (scoped 8 Oct; supersedes "Needs scoping" in handoff/tickets/T-139) |
| Size           | L (2–3 days) |
| Depends on     | T-150 (merged) |
| Branch         | fix/t-139-do-not-ask-for-what-was-given |
| Legal sign-off | NEEDED. Touches `intake.prompts.ts` and/or `intake-brief.ts`. BLOCKED for Ajay until he signs the exact diff |
| Created        | 2026-10-06, scoped 2026-10-08 |
| Source         | `handoff/quality/2026-10-06-baseline-run-FAIL.md` |

## Goal

The questions cover only what the description did not say.

## Acceptance criteria

1. Anushka's five run-1 descriptions (from the baseline file) re-run with a stubbed Reception that returns what the real one returned in run 1: none of these is asked — Police Station ("Saraidhela PS", "PS Kaiserbagh", "Civil Lines thana Gaya", "Kankarbagh PS"), Sections ("303(2) and 317(2) BNS"), Date of dishonour ("15 September 2026"), Date of FIR ("30 Sept 2026").
2. A fact given in the description shows in the brief as known, never under "Still unknown".
3. An amount given in figures (Rs 2,40,000) is never asked in words; the draft prints the words ("Rupees Two Lakh Forty Thousand only") computed by code, with no blank.
4. An IPC section on a matter dated on or after 1 July 2024 gets a plain note in the brief ("IPC does not apply to an offence on or after 1 July 2024; BNS applies") — wording per Ajay.
5. Round counter is right ("Round 1 of 2", then "Round 2 of 2"); the "Answer N more questions" count equals the questions shown; optional fields are not marked "Required".
6. Regression: T-121 (answers kept on going back), T-150 (no contradicting answer kept), T-134 tests stay green.
7. One real-model run of the five descriptions at the end if the session has a model key; report each question asked; otherwise say not run.

## Out of scope

- New intake fields or new documents.
- Custody/jail for Magistrate bail (T-153).
- Image/PDF intake (T-301, T-304).

## What Ajay must sign (exact)

- Any change to the Reception/follow-up prompt text in `apps/drafting/src/services/intake.prompts.ts`.
- Any change to brief rules in `apps/drafting/src/services/intake-brief.ts` (what counts as "given", the matching of police station / sections / dates).
- The IPC-after-1-July-2024 note wording (criterion 4).
- The amount-in-words format (criterion 3), if it prints in a legal-content template.

## Files (expected)

`services/intake.prompts.ts`, `services/intake-brief.ts`, possibly `services/intake.service.ts`, `services/intake-text.ts`, web round counter in `apps/web`. Owns `intake-brief.ts` and `intake.prompts.ts` this batch; T-153 must not touch them.
