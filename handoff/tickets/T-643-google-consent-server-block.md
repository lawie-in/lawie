# T-643 — Server-side block until Google sign-up consent is confirmed

Status: backlog (unassigned). Required before AJ-517-M18's v1 limit ends (Ajay AJ-642-M3, 4adba929).

## Problem
T-642 (v1.2.1) blocks drafting and purchase in the web only while the Google-signup consent prompt is open. Ajay requires a server-side block as well before the v1 limit ends.

## Acceptance criteria
1. For an account where /me needsSignupConsent is true, drafting generate (apps/drafting) and billing pay (apps/billing) return 403 with a stable error code. The web maps that code to the T-642 prompt.
2. Settings, export, delete, privacy and support stay open (AJ-522-M1(a)).
3. The check lives in packages/shared next to require-current-privacy. Arjun reviews the design before the build.
4. Tests cover the google-unconfirmed, google-confirmed and non-google cases.
