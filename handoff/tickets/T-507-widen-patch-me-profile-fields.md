# T-507: Widen PATCH /me for profile fields

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Arjun (design or review), a lead (build) |
| Mode   | Full chain |
| Status | To do. V1 (Priya, 17 Oct 2026). Unassigned until Priya claims a lead |
| Files  | apps/auth (validator, controller, test); gateway allowlist if needed |
| Source | V1 UI checklist, Arjun's code scan (17 Oct 2026) |

## Problem

PATCH /me accepts only the GST state. The user record already stores name, phone, enrollment number, bar council, bar council state, practice areas and years of experience, but nothing lets the user edit them.

## Acceptance criteria

1. PATCH /me accepts name, phone, enrollmentNumber, barCouncil, barCouncilState, practiceAreas, yearsOfExperience, plus two new optional fields: courtsPractisedIn and defaultCourt.
2. Each field validated (length, type, allowed lists); email is never editable here.
3. The current-privacy-acceptance gate stays.
4. Small endpoints in the same ticket: change password (current + new), list active sessions, sign out a session, read privacy acceptance history.
5. Tests per field and for the gate; no personal data in logs.
