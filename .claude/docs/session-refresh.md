# Web session refresh (T-616)

Web only (`apps/web`). Fixes the session ending about 30-35 minutes in, mid-draft. The server half (12 h sliding refresh TTL, 7-day ceiling, 30 s rotation grace, per-user limiter) is T-616b and is documented under "Server (T-616b)" below. Persisting the OneFlow description is a later step.

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

## Server (T-616b)

Code: `apps/auth/src/services/session.service.ts` (`rotateRefreshSession`), `auth.service.ts` (`refreshTokens`, `acceptPrivacy`), `refresh-rate-limit.ts`, `jwt.service.ts`, constants in `packages/shared/src/constants/redis.ts`.

- **Lifetimes.** Access JWT 15 min. A refresh token and its Redis key live 12 h from each rotation (sliding), capped by a 7-day ceiling counted from `originalCreatedAt` (the sign-in). `originalCreatedAt` is carried through every rotation, `/refresh` and the privacy re-accept alike. A session made before T-616b has none and is stamped "now" at its next refresh. Past the ceiling, `/refresh` is 401 and nothing is issued. The Session row's `expiresAt` follows the refresh key. `JWT_REFRESH_EXPIRES_IN` is ignored.
- **Access keys** (`session:<uid>:<hash>`) now live the access JWT's real 900 s (was 24 h).
- **Rotation** is one Lua script (`ROTATE_LUA`): only if the old refresh key still holds the record that was read, it swaps that key for a grace record, writes the new refresh and access keys, and cuts the old access key's TTL to min(30 s, its remaining JWT life) instead of deleting it, so requests in flight with it do not 401. Parallel first presentations: one rotates, the rest become replays.
- **Grace window, 30 s.** The grace record lives at the old key, `session:refresh:<uid>:<oldHash>`. It holds a nonce, the new refresh hash (`h`), the new session id, `iat`/`exp`, the identity claims and, when the old token itself came from a rotation, an optional previous hash (`p`, a hash, not a token). No raw token and no access hash. The refresh JWT is deterministic (`jti` = HMAC of old hash and nonce), so a replay of the same old token rebuilds the byte-identical refresh token, checks its hash against the record, and gets a fresh access token (`REPLAY_LUA` writes it only if the grace record and the successor are unchanged). No second session row or family.
- **After the window** a spent token is 401 and nothing is issued. There is no revoke-on-reuse (separate ticket).
- **Limiter.** `POST /api/auth/refresh`: 60 calls per 900 s per user (`auth:refresh:user:<uid>`, fixed window). It runs after the JWT verifies and before the token is consumed, so a refused call leaves the token usable. Replays count. Over the limit: 429 with `Retry-After` and `{ status, error: 'rate_limited', message, retryAfter }`; the refused call is given back. Redis failure: 503 `{ error: 'service_unavailable' }`, fail closed, nothing consumed.
- **Privacy re-accept** uses the same rotation and grace; its new tokens carry the new `pv`. It is not rate limited.
- **Revocation.** Logout and revoke-one (`deleteSession`) walk the whole family (refresh key, grace records, every access key naming them, rows), so logging out ends the session everywhere. Revoke-all, password reset and account erase (`deleteAllUserSessions`) cover grace records too. Password change (`deleteOtherUserSessions`) keeps the caller's whole family and revokes the rest.
- **Revoke ordering.** All four delete the refresh and grace side first, in one Lua script (`REVOKE_FAMILIES_LUA` via `revokeRefreshFamilies`). It follows a grace record's `h` (successor) and `p` (previous), and a refresh record's `rotatedFrom`, with an optional skip set for a kept family. Only afterwards do they SCAN and delete access keys. A rotation or grace replay landing in between is either followed and its access key caught by the scan, or finds its key gone and fails its CAS.
- **Redis.** Both scripts touch several keys without hash tags: single Redis (or primary plus replicas) only, not Cluster (CROSSSLOT). Key shapes the gateway reads are unchanged.

## Known limits

- A grace replay is 401 if its successor has already rotated again.
- The last rotation before the 7-day ceiling still issues a 900 s access token, so a session can run a few minutes past it.
- Mixed-version rollout: an old auth instance answers 401 to a grace replay, its logout does not walk the family, and its `/refresh` writes no `originalCreatedAt`. Roll auth out quickly.
- Mid-deploy records without `p` or `rotatedFrom` can leave an older link's access key (at most 30 s) alive after logout.
- No per-user session cap exists; the family walk costs O(sessions of one user) and is step-capped.
- The Lua scripts assume a single Redis (no Cluster).
