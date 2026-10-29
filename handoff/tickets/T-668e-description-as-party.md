# T-668e: Accept a description as a valid party in the brief

Status: backlog (not assigned), raised 29 Oct 2026 (Anushka run 5d Minor, via Arjun)
Priority: P3, small, not urgent. Ajay M5b applies.

## Problem
The form hint says "if the name is not known, describe how this person is connected…", but the brief then refuses that description as a non-answer. Under Ajay's M5b, a description that identifies the party is a valid party.

## Acceptance criteria
1. A description that identifies the party, written as the form hint invites, passes the brief's confirm step.
2. Bare non-answers ("Not known", "Not known (…)", "unknown", Hinglish forms) are still refused, exactly as in T-668c/d.
3. Ajay confirms where the line falls between a description and a non-answer, with test cases from M5b.
