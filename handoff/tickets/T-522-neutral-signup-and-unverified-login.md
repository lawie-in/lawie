# T-522: Neutral sign-up answer and unverified-login rule (from T-517)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Arjun (design), Ajay (copy), an auth lead (build) |
| Mode   | Full chain (auth, web) |
| Status | To do. V1 candidate (Vishal's T-517 report, 21 Oct 2026). Priya |
| Source | Ajay AJ-511-M3; T-517 findings |

## Problem
Signed copy (M3) wants the same "Check your email" screen for a new and an existing email. The build differs: an existing email returns 409, new sign-ups are logged straight in, and login never blocks unverified users. The server password rule is 8+ characters with upper, lower and a digit.

## Acceptance criteria
1. Arjun rules whether sign-up reveals an existing account, and whether unverified users can log in; written in this ticket.
2. Auth and web are changed to match the ruling; the signed copy and the behaviour agree (Ajay checks).
3. The web password hint states the real server rule.
4. Tests for new and existing email, unverified login and the password rule.
