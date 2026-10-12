# T-343 — Ask existing users to accept a new privacy version

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Ajay (whether it gates prod, wording). Rajesh (prompt design). Lead (auth, web) |
| Mode   | Full chain (auth and web, legal) |
| Status | Building: kunal (12 Oct 2026). Ajay words, Rajesh designs. Must ship before the next policy change that affects existing users |

T-242 bumps `CURRENT_PRIVACY_VERSION`. Nothing compares a user's stored `privacyVersion` with the current one, so existing users are never asked to accept the new policy.

## Acceptance criteria

1. On sign-in, a user whose stored privacy version is older than the current one sees a prompt to read and accept the new policy.
2. Accepting stores the new version and time; the user carries on where they were.
3. Wording from Ajay; design from Rajesh. Tests for older, current and missing versions.

## Arjun (12 Oct 2026): how drafting and billing know the accepted privacy version

**Option (a), carried the way the gateway already carries identity. No ADR:** it extends an existing pattern (JWT claims → gateway internal headers) and changes no stack or service boundary.
1. **Claim.** Auth puts `pv` (the user's accepted `privacyVersion`, from the user record at issue time) in the access JWT, on login, OAuth exchange and refresh. After the user accepts, the web calls `/refresh` so the new token carries it.
2. **Header.** The gateway's `createAuthenticatedProxy` forwards it as a new internal header (`INTERNAL_HEADERS.USER_PRIVACY_VERSION`), like `USER_PLAN`. It is set by the gateway from the verified claim, overwriting anything the client sent.
3. **Check where the action is.** A shared middleware `requireCurrentPrivacy` (in `packages/shared`, next to `CURRENT_PRIVACY_VERSION`) returns `403 { error: 'privacy_reaccept_required' }` when the header is missing or not equal to the current version. Drafting and billing mount it only on the routes Ajay blocks: create a new draft / start generation, and user-started payments (subscribe, top-up order). Not on view, download, export, delete, support, auth, or the Razorpay webhook. Not option (c): a route list in the gateway would drift from the services.
4. **Fails closed.** A token with no `pv` (every token issued before this ships) counts as not accepted, which is what a re-accept needs anyway.
5. **Open point for Ajay:** a subscription auto-renewal Razorpay starts on its own is not a user-started payment; I read his ruling as not blocking it. Kunal, confirm with Ajay in this file before building.
6. Tests: stale `pv` → 403 on create-draft and on top-up, 200 on view/download/export/delete; accept → refresh → 200; client-sent header is overwritten by the gateway; webhook unaffected.
**Claims:** `packages/shared` (two constants + one middleware) and `apps/gateway/src/app.ts`. Vishal currently holds `packages/shared` for T-192, so Priya sequences this after his release, or splits the shared part out.

Addendum (Arjun, 12 Oct 2026), on Kunal's Explore facts: still (a). `TokenPayload` gains `pv`. `POST /api/auth/me/privacy-acceptance` records the acceptance and **returns a new token pair** (rotate like `/refresh`: new session via `createSession`, old access and refresh sessions deleted), so the web needs no separate refresh call and no stale claim survives. `GET /api/auth/me` and the accept route go through auth's `authenticate`; once the T-299 follow-up lands, that includes the live-session check.
