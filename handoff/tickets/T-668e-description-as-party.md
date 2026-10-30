# T-668e: Accept a description as a valid party in the brief

Status: backlog (not assigned), raised 29 Oct 2026 (Anushka run 5d Minor, via Arjun)
Priority: P3, small, not urgent. Ajay M5b applies.

## Problem
The form hint says "if the name is not known, describe how this person is connected…", but the brief then refuses that description as a non-answer. Under Ajay's M5b, a description that identifies the party is a valid party.

## Acceptance criteria
1. A description that identifies the party, written as the form hint invites, passes the brief's confirm step.
2. Bare non-answers ("Not known", "Not known (…)", "unknown", Hinglish forms) are still refused, exactly as in T-668c/d.
3. Ajay confirms where the line falls between a description and a non-answer, with test cases from M5b.

## Ajay AJ-668e (30 Oct 2026, 93dccb69)
1. M5b is unchanged. "Not known (...)" and similar values still BLOCK, whatever follows. A description WITHOUT a leading non-answer passes, with no length test. New signed line for the blocked case: "Give the name, or only a description that identifies the party, without words like "Not known"."
2. A passing description is stored and printed exactly as typed.
3. Applies to Hindi, role labels, all court packs and ledger given.
4. Hinglish non-answers are covered by AJ-671-M1/M2 and AJ-683-M2.
Build after T-683 merges.
