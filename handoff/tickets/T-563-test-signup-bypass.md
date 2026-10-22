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

## Arjun (22 Oct 2026) — design and security ruling

A deliberate back door gets a deliberate cage. Priya's fences 1–9 stand; the precise rules:

**Switches (env, not AppSettings — they must be boot-checked and absent in prod):** `TEST_SIGNUP_BYPASS=true` and `TEST_SIGNUP_BYPASS_SECRET` (≥ 32 chars, prefix `lts_` so gitleaks can match it; a `.gitleaks.toml` rule is part of the ticket). Boot refuses when either is set and the box is production — production meaning `RAZORPAY_KEY_GUARD=strict` **or** `SECRETS_ENV=prod` **or** an `rzp_live_` key — same place as the Razorpay guard, so one check. Both go on the release checklist as "must be absent". On develop both are set by the founder in the box's env; on an SSM box they live in `/lawie/develop/auth` only, never under `/lawie/prod/`.

**Headers:** the founder's names, `bypass-test: true` and `bypass-password: <secret>`. Only `POST /auth/register`. Nowhere else, ever — not login, not resend, not verify.

**Secret handling:** the founder generates it and types it into the develop box env and into the cloud-session environment settings as `LAWIE_TEST_SIGNUP_SECRET`; Playwright reads `process.env`. No agent, lead, ticket, doc, log or chat ever carries the value; a crew report that quotes it fails review. Compare: `crypto.timingSafeEqual` on SHA-256 digests. Wrong or missing secret with the `bypass-test` header → the request proceeds as an **ordinary** sign-up (T-522's neutral 202), nothing distinguishes the outcome, and one `warn` `test_signup_rejected` with an IP hash only. Rate limit: 5 rejected attempts/h per IP → 429 on the bypass path; 20 accepted test sign-ups/day per IP; at most 200 live test accounts (then 409 `test_accounts_cap`, founder runs the delete script).

**Anushka:** her browser cannot set headers and must not. The T-523 Playwright fixture (or the founder, by curl) creates `TEST_anushka_<n>` accounts; the founder hands her the username and password out of band; she logs in normally. Her run notes the username only.

**The account the server makes:** name must start with `TEST` (server-enforced, 400 otherwise); email must end in `@test.lawie.in` (undeliverable by design; email-worker skips `isTestAccount` users entirely); `isVerified: true` with no mail; `isTestAccount: true` immutable; 30 Ink once, ledger reason `test_grant`; `signupInkGranted` as a normal user so the dashboard reads right; no referral in or out; excluded from analytics events, GA, invoices, Vikram's revenue views, the consent export and Anushka's user counts. Purchases allowed only through test-mode Razorpay keys (develop); the live-key guard already makes it impossible elsewhere. Consent: test accounts record consent version `test-bypass` and are excluded from the consent log export — **Ajay confirms or amends**. Response, bypass applied: 201 with the standard wrapper and tokens; bypass not applied: whatever T-522 answers.

**Lifecycle:** `yarn workspace @lawie/auth test-accounts:list` and `test-accounts:delete --older-than 7d`, dry-run by default, `--apply` to act; delete goes through the existing account-erase service (drafts, documents, ledger, everything). The erase sweep also removes any test account older than 30 days automatically.

**Interplay:** T-522 — the bypass is a branch inside the register handler after validation and before the neutral path; it requires T-522 merged first (Priya's sequencing holds). T-534 — the two values arrive through the same loader as any other secret. T-523 — the Playwright fixture uses it and never prints it.

**Tests:** boot refusal matrix; header without secret → neutral 202 and no account; wrong secret → same, plus the warn and the 429 after five; right secret → 201, `isTestAccount`, 30 Ink, verified, no mail enqueued; name/email rules; cap; delete script dry-run creates no writes.

Mode: full chain, Vishal after T-522. Ajay sign-off reference for the consent line before READY.

## Arjun (22 Oct 2026) — reconciled with Ajay's ruling (`handoff/legal/T-563-test-accounts-ruling-ajay.md`)

Where we differed, **Ajay's stricter line wins**; this section supersedes mine above on these three points.
1. **Email domain:** the bypass applies only to **reserved test domains** — `@example.com`, `@example.org`, or any address under the `.test` TLD (e.g. `TEST_anushka@lawie.test`). Any other address, including `@test.lawie.in`, is an ordinary sign-up with no bypass. `.test` never resolves and `example.*` has no mail, so no verified account can ever sit in a real inbox. The email-worker skip for `isTestAccount` stays as belt and braces.
2. **Retention:** test accounts are erased **within 7 days** of creation by the erase sweep (not 30), and the delete script's default is `--older-than 1d`; Anushka's run ends with the founder running `test-accounts:delete --apply`. Develop only.
3. **Consent:** recorded with `acceptedVia: 'test'`, never counted as real consent, excluded from the consent export; synthetic facts only in any test draft; the 30 Ink carries no user-facing wording (ledger reason `test_grant` only).
Everything else in my section stands. Both rulings now agree; Vishal may build after T-522.
