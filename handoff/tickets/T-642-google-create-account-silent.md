# T-642 — Google on Create account does nothing (prod hotfix)

Status: Merged into develop_staging (32aa3579, CI fix d24d261e). Release v1.2.1 PR #106 to main. Follow-ups: onCloseAutoFocus instead of 50ms refocus; named secondaryButtonLarge; direct AC3 test; 3001 fallback in review/[token]/page.tsx:40.

**SCOPE CHANGED 27 Oct 2026 (founder: build all now):** full chain. A) M16 next-sign-in consent panel for acceptedVia 'google' accounts (AJ-642-M1..M7, Arjun field names + 3 conditions, Rajesh panel (c) + constraints). B) Google on Create account needs no tick; byContinuing line on both tabs; email keeps the checkbox. The original ACs below are superseded by those rulings.
Priority: P0 hotfix on v1.2.0 prod
Mode: small fix (web only, one file + its tests)

## Problem
On prod (v1.2.0, main 849bb38e), on the Create account tab, clicking "Continue with Google" does nothing: no redirect, nothing visible. On the Sign in tab Google works.

Likely cause (Priya read of apps/web/src/app/(auth)/login/page.tsx): `handleGoogleLogin` → `consentMissing()` (T-517, AJ-517-M3) returns early when the consent box is unticked. It sets `consentError` and focuses the checkbox, but the box and its error sit far below the Google button (~line 1159 vs ~978). So the user sees nothing happen. Confirm in Explore; if the cause is different, report BLOCKED to Priya with what you found.

## Acceptance criteria
1. On Create account with the consent box unticked, clicking Google gives a visible response in the viewport: the consent box is scrolled into view (respect prefers-reduced-motion) and focused, and its existing required-consent error (CONSENT_COPY.required, unchanged wording) is visible.
2. Clicking Google with the box ticked starts the Google redirect exactly as today (challenge, referralCode, utm params, return path unchanged).
3. The consent gate itself stays: no Google redirect from Create account without consent (Ajay AJ-517-M3). No new copy, no wording change, no layout redesign (Rajesh) — behaviour only.
4. The Sign in tab is unchanged.
5. Same fix for the email Create account button if it has the same off-screen problem (only if Explore shows it does).
6. Tests in the existing login page test file(s) cover AC1-AC4; `yarn workspace @lawie/web test` and `build` green.

## Out of scope
Moving the consent box, new copy, any auth service change.

## Release
Hotfix: merge into develop_staging (normal slot), then Priya cuts release/v1.2.1 from main for the founder.
