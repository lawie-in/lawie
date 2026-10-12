# T-319 — Login CSRF on Google sign-in (HIGH)

| Field  | Value |
| ------ | ----- |
| Phase  | 0 — Before go-live. HIGH, security |
| Owner  | Arjun (spec, at the end of the T-306 file). Kunal (build) |
| Mode   | Full chain (auth + web) |
| Status | To do. Kunal right after T-306 (same files). Size S. Found by Kunal, ruled by Arjun, 12 Oct 2026. Not a T-306 regression |

An attacker can log a victim into the attacker's account through Google sign-in. Anything the victim then drafts lands in the attacker's account.

## Acceptance criteria (Arjun)

1. Before the Google redirect, the web app makes a PKCE-style verifier and keeps it in `sessionStorage`.
2. The verifier's hash travels in an HMAC-signed OAuth `state`.
3. On the code exchange, auth checks the verifier against the signed hash, and refuses the exchange on a mismatch, a missing value or a bad signature.
4. No cookies and no CORS change.
5. Tests cover the good path and each refusal.
