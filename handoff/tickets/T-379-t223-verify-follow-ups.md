# T-379 — T-223 follow-ups: auth dev dependency and the email placeholder guard

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (auth + email-worker) |
| Mode   | Small fix |
| Status | Building. Kunal. Item 2 must land before live sends (the founder's SES session). Priya, 13 Oct 2026 |
| Source | T-223 review round 2 should-fixes (Mahak, 13 Oct 2026) |

## Acceptance criteria

1. `apps/auth/package.json` declares `"yaml": "^2.4.2"` in devDependencies (used by the t223-build-deps test, today only hoisted through lint-staged). No lockfile change.
2. The email worker in live (non-dry-run) mode refuses to start, or reports unhealthy on /health, while the footer still has the [registered address] or [PIN] placeholders. A refused job no longer rotates the user's token or uses up their resend cap.
3. The placeholder guard checks the template's static footer, not the rendered output, so user data containing "[PIN]" isn't refused.
4. Tests for 2 and 3.
