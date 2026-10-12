# T-306 — Login tokens may be sent to Google Analytics (HIGH, security)

| Field  | Value |
| ------ | ----- |
| Phase  | 0 — Prep |
| Owner  | Arjun (fix design). Lead (build, web). Ajay heads-up (DPDP) |
| Mode   | Small fix (web), security |
| Status | To do. HIGH. Found by Kunal during T-234, 12 Oct 2026. Pre-existing (older than T-234) |

After Google sign-in the app lands on `/auth/callback?accessToken=…`. Google Analytics records `page_location`, so the access token is likely being sent to Google in the page URL.

## Acceptance criteria

1. No token ever appears in a URL that analytics or logs can see: tokens move out of the query string (Arjun picks: fragment, POST, or an httpOnly cookie set by the server), or analytics is not loaded on `/auth/callback` and the URL is cleaned before any page view fires.
2. A test (or a recorded browser check) shows the analytics page view for the callback carries no token.
3. Arjun decides whether already-issued tokens must be rotated; if yes, the founder is told what to do.
