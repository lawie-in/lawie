# Web session refresh (T-616)

Web only (`apps/web`). Fixes the session ending about 30-35 minutes in, mid-draft. The server half (12 h sliding refresh TTL, 30 s rotation grace, per-user limiter) is T-616b and is not in this change. Persisting the OneFlow description is a later step.

## Model

- Bearer JWTs in `localStorage`. Access token lives 15 minutes. The refresh token is single-use and rotates on every call to `POST /api/auth/refresh`.
- Proactive refresh about 60 s before the access token expires.
- Any 401 from `apiFetch` triggers exactly one refresh, then one retry of the request. A second 401 ends the session.
- 429, 5xx and network errors never sign the user out. Refresh retries back off 1, 2, 4 ... 60 s; a `Retry-After` header is honoured but capped at 5 minutes.
- Cross-tab: one tab refreshes at a time under the Web Lock `lawie-session-refresh` (5 s acquire timeout). Other tabs pick up the new tokens through the `storage` event, so a rotated refresh token is never replayed.

## When the session really ends (refresh rejected)

- Forced end keeps the unsaved description under `lawie:draft-prefill` and writes the marker `lawie:forced-end-subject`. The same user signing back in gets the text back; a different user does not (the text is discarded).
- Explicit sign-out wipes both keys.
- Return path: guards send the user to `/login?next=<pathname>`. `safeReturnPath` / `buildLoginRedirect` (`apps/web/src/lib/safeReturnPath.ts`) accept pathname only (no query or hash), same-site, strict allowlist, no `/login`, `/auth` or `/api`. The path is held per tab in `lawie:post-login-path` across the Google redirect and is never sent to Google.

## UI

"Reconnecting..." banner in the dashboard layout only, in both its shells (Night shell and the legacy shell where `/dashboard/new` drafting lives), English only. The admin layout got return-path handling but no banner. States: hidden, reconnecting, still-trying (after 30 s), reconnected (shown 3 s), hidden. Hidden at once when offline (the offline banner speaks then) or signed out.

## Code map

- `apps/web/src/lib/sessionRefresh.ts` - refresh scheduling, lock, cooldown.
- `apps/web/src/lib/apiFetch.ts` - 401 handling, refresh-then-retry.
- `apps/web/src/lib/auth.ts` - token storage, forced end vs sign-out.
- `apps/web/src/lib/safeReturnPath.ts` - return-path validation.
- `apps/web/src/components/shell/SessionReconnectingBanner.tsx` - banner.
- Tests: `apps/web/e2e/t616-session.spec.ts` plus the `t616` / `sessionRefresh` / `apiFetch` / `safeReturnPath` unit tests under `apps/web/src`.

## Not covered

Idle timeout and the maximum session length are server decisions (Arjun, T-616b). Until T-616b ships, a user is still bound by the server's current refresh-token lifetime.
