# T-563: Test sign-up bypass for agents (develop only)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (needed before Anushka's browser run and live agent smoke) |
| Owner  | Arjun (design and security review), Ajay (consent and data), a lead (build; Vishal, after T-522 merges: same auth files) |
| Mode   | Full chain (auth, gateway, shared, web test tooling) |
| Status | To do. Founder order 22 Oct 2026. Design first (Arjun). Priya |
| Source | Founder: agents need to test without signing up through email |

## What the founder asked
A random password sent in request headers (`bypass-test: true`, `bypass-password: <password>`) so agents can create test users without email verification. Such sign-ups get 30 Ink. Their username must start with `TEST`.

## Security musts (Arjun confirms or amends; this is a deliberate back door, so it is fenced)
1. **Off by default, develop only.** Two settings in the environment: an enable flag and the secret. Both are absent in production. Production boot REFUSES to start if either is set while the production marker is on (same pattern as the Razorpay key guard in strict mode). Names go in the example env file (names only, never values).
2. **The founder generates and holds the password.** No agent, ticket, commit, log, screenshot or chat message ever contains it. Agents receive it only through the environment of their own session or a local secret the founder sets, never a repo file. It is rotated by changing the setting and restarting.
3. **Constant-time comparison.** A wrong or missing password behaves exactly like a normal sign-up (same response; no hint that a bypass exists). Failed attempts are rate-limited per IP and logged without the supplied value.
4. **Only on the sign-up route**, and only when `bypass-test: true` is present with the right password.
5. **Name rule enforced on the server:** the name must start with `TEST`; otherwise the request is treated as a normal sign-up (no bypass).
6. **What a test account gets:** verified email (no mail sent), 30 Ink once through its own ledger reason (not the normal sign-up grant, no referral), `isTestAccount: true` on the user. Test accounts are excluded from analytics, referral, invoices and reports, and cannot buy or subscribe through live Razorpay (billing guard).
7. **Response:** the tokens needed to proceed, only when the bypass applied (a normal sign-up keeps the neutral T-522 answer).
8. **Cleanup:** a read-only list script and a delete script for `isTestAccount` users with a dry-run default; the founder runs them.
9. **Consent and legal:** Ajay rules whether test accounts record the same Terms and Privacy acceptance as real users (default: yes, recorded, so no code path skips consent), and whether the 30 Ink grant needs any wording.

## Acceptance criteria
1. Tests: wrong password, missing password, missing `bypass-test`, name without `TEST`, production marker plus enable flag refuses to boot, rate limit, constant-time compare helper used, 30 Ink once, normal sign-ups unaffected.
2. A guard test fails if the secret's name appears in any client bundle or any `NEXT_PUBLIC_` variable.
3. Arjun's security review passes before merge. Ajay byte-checks any new string (none expected).
