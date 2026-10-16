# T-484: The no-template fallback loses the section, the advocate details and the party

| Field  | Value |
| ------ | ----- |
| Status | To do. V1.1 (decide with Ajay and Arjun). Priya, 16 Oct 2026 |
| Owner  | Lead (assign later), Ajay gates |
| Mode   | Full chain |

## Source

Anushka quality run 4 on develop, 16 Oct 2026 (handoff/quality/2026-10-16-run-4-develop-FAIL.md). Priya triaged it on 16 Oct 2026.

## What Anushka saw (caveat under s.148A CPC, Civil Judge (Senior Division), Patna)

The fallback does not refuse and asks sensible questions, but: title reads "Caveat under Section A CPC" and the body "[Section - verify before filing]" although she named s.148A; the advocate's name, enrolment and chamber are blank; the court was put in as the party the caveat is against; caveator and relief blank though given; no statement that a copy was served on the expected plaintiff (s.148A(2)); unfillable blanks listed; checks say "no mismatch"; first Confirm click did nothing (T-481).

## What

Keep the section the user names, carry advocate details, never put the court as a party, and prompt for the s.148A(2) service line. Ajay decides whether a caveat should be a real pack (likely, v1.1) or the fallback must do this right.

