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
