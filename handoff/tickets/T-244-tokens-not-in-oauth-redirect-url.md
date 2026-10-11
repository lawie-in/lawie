# T-244 — Sign-in tokens must not travel in the OAuth redirect URL

| Field          | Value |
| -------------- | ----- |
| Phase          | 4 — Polish and release |
| Owner          | Arjun (approach). Lead (build). Anushka (verdict) |
| Mode           | Full chain (auth and web). Arjun picks the mechanism first |
| Status         | To do. Unassigned. Found by Arjun, 12 Oct 2026. Follow-up to T-230 |

## Problem

After Google sign-in, `oauth.routes.ts:73-78` redirects to `/auth/callback?accessToken=…&refreshToken=…`. The tokens can end up in browser history and in host or nginx access logs. The token carries the user's email and name (T-230).

## Acceptance criteria

1. Arjun picks the mechanism (for example a one-time code exchanged by POST, or a URL fragment) and records it here.
2. No access or refresh token appears in any URL the browser loads.
3. Test: the callback URL contains no token. Sign-in still works for Google and for email.
