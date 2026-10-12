# T-299 — Auth: four small fixes found in T-234

| Field  | Value |
| ------ | ----- |
| Phase  | 0 — Prep |
| Owner  | Arjun (triage; item 2 is security). Lead (build) |
| Mode   | Small fix (auth, web, gateway test), after T-234 merges |
| Status | To do. Found by Kunal in T-234, 12 Oct 2026 |

1. Google sign-ups are stored with `authProvider: 'email'`. It should say Google.
2. Login returns 403 for a deactivated account, which tells anyone the email exists. Arjun decides the response (likely the same 401 as a wrong password).
3. `/login` ignores `?error=oauth_failed`, so a failed Google sign-in shows nothing. Show a short error (Madhuri words it).
4. The gateway register-role test has a stale comment after T-234/T-298 (role Lawyer). Update the comment.

## Acceptance criteria

Each item fixed with a test, or closed by Arjun with a reason.
