# T-344 — Keep the sign-up source until sign-in actually succeeds

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (web) |
| Mode   | Small fix (web) |
| Status | Merged into develop_staging c16b5db (12 Oct 2026). Anushka tests on develop |

The web `/auth/callback` clears the stored UTM tags even when Google sign-in is cancelled, so a retry loses the source.

## Acceptance criteria

1. Stored UTM tags are cleared only after a successful sign-in.
2. A cancelled or failed Google sign-in keeps them for the next try, within Ajay's T-242 limits (session storage only).
3. Tests for success, cancel and error.
