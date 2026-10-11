# T-196 — Registration can never create an Admin account

| Field          | Value                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------- |
| Phase          | 0 — Prep (security)                                                                                     |
| Owner          | Vishal (build). Arjun gets a security heads-up                                                          |
| Mode           | Build, full chain (touches auth). Merge to develop                                                      |
| Priority       | Urgent. The founder said "fix it right now", 11 Oct 2026                                                |
| Status         | In build                                                                                                |
| Size           | S (half a day), plus the founder's ops check                                                            |
| Depends on     | None                                                                                                    |
| Gate           | Before anything else is merged to `main`, and before v1 (T-403)                                         |
| Branch         | fix/t-196-register-admin-role                                                                           |
| Legal sign-off | Not needed. No legal content is touched                                                                 |
| Created        | 2026-10-11                                                                                              |
| Source         | Tester during T-147e; confirmed in the code by Vishal, 11 Oct 2026                                      |

## Problem

`apps/auth/src/validators/auth.validator.ts:13` accepts `role: z.enum(['Admin','Lawyer','Client']).default('Client')`, and `apps/auth/src/services/auth.service.ts:26` uses `payload.role`. Anyone who calls `POST /auth/register` with `"role":"Admin"` gets an Admin account.

The Admin role is the only check on every admin route: users, billing, coupons, app settings, review links and usage stats. Admin also skips the free-draft limit. So one request gives full admin access and unlimited drafting.

## User

- Every advocate on Lawie, whose account and data sit behind the admin routes.
- The founder, who is the only person who should hold Admin.

## Solution

The server decides the role at signup. No field from the client can set or change it. Admin is granted only by a server-side or ops action.

## Context (Priya, from a read of `develop` on 11 Oct 2026; Vishal to confirm)

- Signup paths found in `apps/auth`: `POST /auth/register` (email and password; the referral code rides on it) and Google OAuth first login (`apps/auth/src/config/passport.ts`, around line 52). No separate invite path was found.
- Google first login hard-codes `role: 'Lawyer'` today. It is not client-supplied, so it is not the hole. Under AC 2 it stays `Lawyer`. `Lawyer` is not checked anywhere in the code. Existing Google users who are `Lawyer` stay as they are (out of scope).
- `User.model.ts` already defaults `role` to `Client`.
- No API sets `role`: `PATCH` in `admin-users.routes.ts` only takes `isActive`. No seed script that grants Admin was found. So today the only way to make an Admin is a direct change in the database.
- The gateway forwards register to auth (`apps/gateway/src/app.ts`, around line 96).

## Acceptance criteria

1. Registration always creates the role `Client`, whatever the request sends: `Admin`, `Lawyer`, an unknown value, or a different case such as `admin`. The request still succeeds; the role field is ignored, not rejected.
2. Every other user-creation path (OAuth/Google first login, referral, invite) keeps its existing server-set role (Google stays Lawyer). No client-supplied field can set or change the role.
3. Existing Admin accounts keep working. Login, refresh and OAuth login still return the user's real role from the database.
4. The only way to grant Admin is a server-side or ops action. The path that exists today (a direct database change, or a script if one is added) is written in this ticket's delivery report, with the exact steps.
5. Tests prove 1 and 2 at the auth-service level, and through the gateway for register: a request with `"role":"Admin"` and one with `"role":"admin"` both produce a `Client` user and a token with role `Client`.
6. CI green on all four services. No test is skipped, disabled or deleted.
7. Ops note for the founder is in the delivery report (see below). It is a check the founder runs, not code.

## Ops note for the founder (to run once the fix is merged)

1. In the production and the dev databases, list every user whose `role` is `Admin`, with email and created date.
2. Any Admin account you did not create on purpose: set `role` to `Client`, and note the email and date here.
3. If any such account exists, tell Arjun. He decides whether to look at what it did on the admin routes (`admin-audit` log) and whether any secret or setting needs to change.

Vishal writes the exact query in the delivery report.

## Out of scope

- The role model itself (which roles exist, what `Lawyer` means)
- A Lawyer signup flow
- Changing the role of existing Google users from `Lawyer` to `Client`
- An admin screen for granting roles

## References

- `apps/auth/src/validators/auth.validator.ts:13`
- `apps/auth/src/services/auth.service.ts:26`
- `apps/auth/src/config/passport.ts`
- T-147e (where the tester found it)
