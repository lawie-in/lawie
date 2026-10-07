# T-140 — I can choose my court, and only courts that can hear the matter

| Field      | Value                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| Phase      | 1 — Describe and draft                                                                                        |
| Owner      | Priya (scope), Ajay (which courts for which document), Vishal (build), Anushka (verdict)                      |
| Mode       | Full chain, then the quality gate                                                                             |
| Status     | Needs scoping. Not started. Cause not traced yet                                                              |
| Depends on | None                                                                                                          |
| Branch     | fix/t-140-any-court-can-be-chosen                                                                             |
| Created    | 2026-10-06                                                                                                    |
| Source     | Anushka's run 1, 6 Oct 2026, verdict FAIL. Her words are in `handoff/quality/2026-10-06-baseline-run-FAIL.md` |

## Goal

A lawyer from any district can name the court, and is not offered a court that cannot hear the matter.

## What Anushka found

- **Major.** The court is "Needed to continue" but can only be picked from a short list. Sessions Court: Bihar 11 of 38 districts, Jharkhand 10 of 24, UP 10 of 75; Assam has all. Chief Judicial Magistrate: Bihar only Patna, UP only Lucknow. Delhi has no Magistrate court type. There is nowhere to type a court.
- For anticipatory bail the list offers "Chief Judicial Magistrate", "consumer_commission", "tribunal".
- Minor: the state list has "India" as a state and the Andaman and Nicobar Islands twice. Internal words on screen: "consumer_commission", "tribunal", "supreme_court", "jharkhand_sessions_dhanbad".
- For a practising advocate: the Delhi court name "New Delhi District Court (Shaheed Bhagat Singh Place / S.K. Saheb)".

## Acceptance criteria (draft, Priya to confirm)

- A court that is not on the list can be typed in.
- For each document, only the court types that can hear it are offered.
- No internal word reaches the screen.
- Anushka tests again from the start and her verdict is PASS.

## Notes

- Founder's rule of 6 Oct 2026 applies: a generic answer, not a longer hand-made list per state.
- Not known: whether the full courts list has been seeded.
