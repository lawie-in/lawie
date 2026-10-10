# T-193 — Bail packs warn when the applicant is under 18

| Field          | Value                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| Phase          | 1 — Describe and draft                                                                                    |
| Owner          | Ajay (warning text, signs). Vishal applies. Anushka (verdict)                                             |
| Mode           | Legal content (pack change), then a small change through the dev lead                                     |
| Status         | To do                                                                                                     |
| Size           | S (0.5 day), plus Ajay's sign-off time                                                                    |
| Depends on     | None                                                                                                      |
| Gate           | Proposed (Priya): before v1 go-live (T-403). Ajay to confirm                                              |
| Branch         | feature/t-193-jj-act-warning                                                                              |
| Legal sign-off | Needed. Pack change under `apps/drafting/src/config/document-rules/`                                      |
| Created        | 2026-10-10                                                                                                |
| Source         | Vishal and Ajay, T-147c follow-up, 10 Oct 2026                                                            |

## Problem

When the applicant is under 18, the forum is the Juvenile Justice Board under JJ Act 2015 s.12, not the court under BNSS s.480 or s.483. Today the bail packs draft a BNSS application for a minor without warning.

## User

District court advocate who has a minor client and must file before the right forum.

## Solution

`bail_regular` and the bail family warn the advocate when `applicant_age` is under 18.

## Acceptance criteria

1. Ajay writes and signs the warning text in this file, and says whether drafting is stopped or goes on after the warning.
2. The warning shows in the brief when `applicant_age` is below 18, before any draft is made.
3. It applies to `bail_regular` and each bail-family pack. Vishal lists the packs in the report.
4. Tests: age 17 warns, age 18 does not, a missing age does not warn and does not guess.
5. Golden snapshots are run. Any change is read and approved by Ajay, never updated automatically.

## Out of scope

- A Juvenile Justice Board bail pack
- Age checks for documents outside the bail family

## References

- JJ Act 2015 s.12, BNSS s.480 and s.483, T-147c
