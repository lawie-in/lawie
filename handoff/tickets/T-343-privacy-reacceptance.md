# T-343 — Ask existing users to accept a new privacy version

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Ajay (whether it gates prod, wording). Rajesh (prompt design). Lead (auth, web) |
| Mode   | Full chain (auth and web, legal) |
| Status | To do. Ajay to say whether it must ship before prod. Raised by Kunal's T-242 review, 12 Oct 2026 |

T-242 bumps `CURRENT_PRIVACY_VERSION`. Nothing compares a user's stored `privacyVersion` with the current one, so existing users are never asked to accept the new policy.

## Acceptance criteria

1. On sign-in, a user whose stored privacy version is older than the current one sees a prompt to read and accept the new policy.
2. Accepting stores the new version and time; the user carries on where they were.
3. Wording from Ajay; design from Rajesh. Tests for older, current and missing versions.
