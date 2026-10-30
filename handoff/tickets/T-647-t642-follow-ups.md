# T-647 — T-642 follow-ups (Google sign-up consent)

Status: backlog (unassigned). From Ajay (after his T-642 byte check) and from the T-642 reviewer, 27 Oct 2026. None of these blocks a release.

## Acceptance criteria
1. (Ajay a) POST /me/signup-consent sends the Terms and Privacy versions the page showed. The server stores those versions, not its current constants, and rejects any version it does not know.
2. (Ajay b) termsAcceptedAt is updated together with termsVersion on acceptance.
3. Replace the 50 ms refocus timer with Radix onCloseAutoFocus.
4. Add a named secondaryButtonLarge constant in intake/ui.ts, replacing the BriefStep class swap.
5. Add a direct AC3 test: email Create account keeps its checkbox.
6. Fix the 3001 fallback in apps/web/src/app/review/[token]/page.tsx:40.
