# T-616: Session ends after about 30-35 minutes and sends the user to sign in mid-draft

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (severity P1; from the prod quality check of 26 Oct 2026) |
| Owner  | Mahak or Tanvi (auth/web); Arjun decides lifetime |
| Mode   | Full chain |
| Status | Building (Kunal), 26 Oct 2026 (stop lifted). Priya |
| Source | handoff/quality/2026-10-26-prod-drafting-FAIL.md |

## Problem
Signed in about 21:48 IST; at about 22:20 IST opening New document sent the user to sign-in (Continue with Google) midway through a draft. A lawyer must not lose a session mid-work. Quality report item 8.

## Acceptance criteria
1. Arjun states the intended session design (access token lifetime, silent refresh, idle timeout).
2. A user working continuously stays signed in for at least a working day; a draft in progress is never interrupted by an expired token (silent refresh).
3. An unsaved description is not lost when sign-in is required (return to the same page).

## Files
Lead lists after Explore (auth session / token refresh (web + auth)). Claimed by Priya.

## Scope after Kunal's Explore (26 Oct 2026)
T-538 (SSE stages, Last-Event-ID, runs/:runId) is NOT built, so reload-resume moves out of this ticket to T-538/T-539. This ticket: the web-only session fix (tokens are bearer JWTs in localStorage; access JWT 15 min by default; nothing refreshes proactively; on full page load an expired access token is treated as signed out without trying the refresh token; any failed refresh, including a 429 from the shared per-IP limit, signs out every tab). Server-side options wait for Arjun's answers.

## Design (Arjun's rulings, 26 Oct 2026; Arjun countersigns here)
1. Keep 15 min access tokens. Proactive refresh about 60 s before `exp` on a timer, plus one refresh-then-retry on any 401. Never decide "signed out" before a refresh attempt.
2. "A working day" = sliding: refresh token TTL 12 h, renewed on every refresh, absolute ceiling 7 days from login; no separate idle timeout (the 12 h window is it). Env NAMES `SESSION_TTL_HOURS=12`, `SESSION_ABSOLUTE_DAYS=7`; shared constants in packages/shared.
3. Keep single-use rotation AND add a server grace window: a refresh token reused within 30 s of its rotation returns the same new pair (idempotent); after 30 s it is a reuse and the token family is revoked. The client serialises refreshes across tabs (lock + storage event); grace is the safety net.
4. `/api/auth/refresh` gets its own limiter keyed by user id (sub in the refresh token), 60 per 15 min, excluded from the shared per-IP 200/15 min. 429/5xx/network on refresh never sign the user out: retry with backoff, keep the old access token until it truly expires.
5. Keep localStorage for now. httpOnly cookies across lawie.in and api.lawie.in need a separate CSRF/CORS ADR.
6. sessionStorage holds the unsaved description (at most 4,000 characters), cleared after a successful restore and on explicit sign-out (T-565's wipe stays); never localStorage.
7. Split: T-616 = web now (Kunal). T-616b = server parts (refresh grace, per-user limiter, shared TTL constants), same lead right after, full chain (auth + gateway). T-538/T-539 (SSE resume) stay separate, after Phase 0.

Arjun (CTO) countersignature: ____
