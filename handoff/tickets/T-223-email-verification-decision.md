# T-223 — Do we verify a new user's email?

| Field          | Value |
| -------------- | ----- |
| Phase          | 0 — Prep |
| Owner          | Arjun and Vikram (recommend), Founder (decides), then Lead (build) |
| Mode           | Decision first |
| Status         | Merged into develop_staging 9ae7d51 (mahak, 13 Oct 2026). Dry run until the founder's SES session and the footer address and PIN; T-379 before live sends. Waiting for Anushka on develop |
| Size           | Decision XS. Build M if yes |
| Depends on     | T-220 |
| Gate           | Before v1 go-live, because free drafts can be farmed with throwaway emails |
| Branch         | feature/t-223-email-verification |
| Legal sign-off | Not needed |
| Created        | 2026-10-11 |
| Source         | Founder asked for email scope, 11 Oct 2026. Priya's survey of `apps/email-worker` and `packages/email-client` |

## Question

`User.emailVerified` exists but nothing sets or checks it. Anyone can sign up with an address they don't own and get the free drafts. Options:

- A. Verify before the first draft (link by email). Stops farming; adds a step.
- B. Verify before buying or before the second free draft.
- C. Don't verify in v1; rely on Google sign-in and rate limits.

Arjun and Vikram recommend one with the cost of free-draft abuse; the founder decides. If A or B, this ticket gets acceptance criteria then.

## Vikram (11 Oct 2026)

Cost side only. Nothing below is measured at scale: T-004 has not run, so every rupee figure is an estimate except the one dev draft.

**What one free draft costs us (model spend, ₹96.5 per dollar)**

| Assumption | Value | Source | Sensitivity |
| --- | --- | --- | --- |
| Free allowance per new account | 5 Ink, one-time (`inkTopup: 10` units) | `apps/auth/src/services/credit-bonus.service.ts` `grantSignupBonus` | Most drafts cost 2 Ink, so 2 to 5 drafts per account |
| Ink per draft | 2 for most documents, 1 for 31 short ones (Vikram, T-227); each template is priced explicitly in one list | `apps/drafting/src/services/credits.service.ts` (price list, T-227) | Not yet the drops formula (T-004). Updated by Priya, 12 Oct 2026 |
| Cost of one draft, measured floor | ₹1.2 to ₹1.8 | T-004 dev point: 1,599 in / 907 out tokens, 10 paragraphs, at Sonnet 5.5 ($2/$10) or 4.5 ($3/$15) | One short draft; proves nothing alone |
| Cost of one draft, planning value | ₹6 (₹4 to ₹7 for 5 to 18 paragraphs) | T-004 estimate: 10 para ₹5.5, 25 para ₹8.7 at $3/$15 | About a third lower on Sonnet 5.5 rates |
| Cost of one draft, worst case | ₹14 | T-004 estimate, 50 paragraphs | Guided drafts (T-108) about ₹5.5 at 25 paragraphs; page reading extra |
| Failed attempts | Cost us, not charged to the user | `enforceCredits` header: spend happens after success | Retries add to our cost, unmeasured |
| Verification email | About ₹0.01 each | SES (`apps/email-worker/src/providers/ses.ts`), about $0.10 per 1,000 | Negligible |

**Cost per farmed account and at scale**

| Throwaway accounts per month | Planning (₹30 per account: 5 drafts × ₹6) | Worst (₹71: 5 × ₹14.2) | Against Phase 1 MRR (₹19,975; about ₹19,500 net of Razorpay 2% + GST) |
| --- | --- | --- | --- |
| 100 | ₹3,000 | ₹7,100 | 15% to 36% |
| 1,000 | ₹30,000 | ₹71,000 | 1.5× to 3.6× |
| 10,000 (scripted) | ₹3,00,000 | ₹7,10,000 | Not survivable |

- The per-user rate limit (`apps/gateway/src/middleware/rateLimiter.ts`, 60 req/min free) is keyed on the account, so it does nothing against many accounts. Sign-up only has the IP limit of 200 requests per 15 minutes on `/api/auth`.
- Under option B, an unverified account can cost us 1 draft: ₹6 planning, ₹14 worst. 1,000 throwaway accounts would cost ₹6,000 to ₹14,000, down from ₹30,000 to ₹71,000.

**Largest cost driver:** Sonnet output tokens per draft (T-004 is still unrun).

**Biggest assumption risk, and it is bigger than this ticket:** one account is not capped at 5 Ink. `enforceCredits` only checks the balance before the stream. `spendInk` runs after generation. When it fails for lack of Ink, `apps/drafting/src/routes/documents.routes.ts` (around lines 596, 1060, 1264) only logs the error and still delivers the draft. Parallel requests from one funded account all pass the pre-check, so each extra one is a free draft at our cost. Email verification does not close this. It needs its own fix ticket (Priya to raise, Arjun to size) before v1 go-live.

**My pick: B, verify before the second free draft**, with Google sign-in counted as verified.
- Unverified exposure falls from about ₹30 to about ₹6 per throwaway account. Verification costs about ₹0.01.
- The first draft stays free of friction. For 25 paying users, conversion is worth more than the ₹6 we save by choosing A.
- A saves only about ₹6 more per farmed account, and it puts a step in front of the first draft.
- C leaves about ₹30 to ₹71 per account open, with no control that works across accounts.
- Verification does not stop disposable inboxes. If farming shows up in the inkledger after launch, block known disposable domains next, before moving to A.

## Arjun (11 Oct 2026)

**Recommendation: B, in this form.** Verify before the second free draft and before any purchase. First draft stays instant.

What the code shows today:

- Every new account gets 5 Ink (`grantSignupBonus`, both email and Google sign-up) plus 2 Ink per daily login (`DAILY_LOGIN_BONUS`). One throwaway address therefore yields a first draft immediately and a steady drip afterwards. The drip, not the first draft, is the farming risk.
- Google sign-in does not set `emailVerified`; nothing sets or reads it.
- The only limit in front of register is the gateway's public limiter, 200 requests per 15 min per IP. That does not stop farming.

Why B over A and C:

- A: puts a mailbox round-trip before the first value moment. Our users are district-court advocates on phones, often mid-hearing; every lost activation hurts the 25-paying-users target more than a few farmed drafts cost us.
- C: leaves the daily bonus farmable per throwaway account, and leaves us without a verified address for payment receipts and password reset. Rate limits per IP do not help against mobile carrier NAT in either direction.
- B: one real draft unblocks the value moment; anything beyond it (second draft, daily bonus, checkout) needs a verified address. Abuse cost is capped at one draft per throwaway address.

Shape for the AC when the founder picks B:

1. Google sign-in sets `emailVerified = true` when Google's `email_verified` claim is true. No email sent.
2. Email/password sign-up sends a verification link (signed, single-use, 24 h expiry) through T-220.
3. Unverified users: first draft allowed; second draft, daily login bonus and Razorpay checkout are refused with a "verify your email" prompt and a resend button (resend rate-limited).
4. Signup register limit tightened separately at the gateway (per IP and per device), independent of this ticket.

Risk: B depends on T-220 delivering to the inbox. If T-220 slips past go-live, fall back to C plus "daily bonus only for Google sign-in users" until verification ships. Cost of a farmed draft: Vikram's section.

## Priya (11 Oct 2026): the question changes

Phase 1 is Google sign-in only (founder decision, 17 May 2026), so every account made through the web app already has a verified email. The hole is that the auth API still accepts `POST /auth/register` and `/auth/login` with an email and password, so a script can make throwaway accounts without the UI. Option D, for the founder alongside B:

- D. Switch the email and password register and login routes off on the server for Phase 1, the same way the web app hides them (Google only). No verification email is needed, so T-220 is not on this path. If password login returns, B applies then.

## Decision (Priya, 11 Oct 2026)

Founder, 11 Oct 2026 (in the Priya session and on the board): email and password sign-up and sign-in ship in this release, alongside Google. This replaces the 17 May 2026 'Google only for Phase 1' decision. Option D is out. Option B, as Arjun and Vikram recommended: the first draft stays instant; the second draft, the daily login bonus and checkout need a verified email; Google sign-in counts as verified. The build needs T-220 (sending) and a verification email (Madhuri copy, Ajay check). Acceptance criteria to be written before a lead takes it.

## Update (Priya, 12 Oct 2026)

Founder flagged fake email sign-ups farming the 5 free Ink. T-351 (now) gives email sign-ups no free Ink until verified; Google counts as verified. This ticket then adds the signed, single-use, 24 h verify link, a resend button (rate-limited) and the "verify your email" prompt, and grants the sign-up bonus once on verification. Needs T-220 sending; builds against dry-run meanwhile (Arjun). Lead: mahak, with T-220. Release gate.

- When this ticket sets `emailVerified` true, it must call `grantSignupBonus` once (T-351 holds the bonus back until then). From Shashank, 12 Oct 2026.
- An existing unverified email user who links Google becomes eligible via googleId (T-351) but passport grants the sign-up bonus only to new Google users. Decide here whether linking Google also calls grantSignupBonus once. From Shashank, 12 Oct 2026.

## Acceptance criteria (Priya, 12 Oct 2026, on the founder's delegation; Arjun's shape for option B, adjusted for T-351)

T-351 already gives an unverified email user no free Ink. Arjun's "first draft stays instant" therefore has nothing to spend until the address is verified. That is accepted. This ticket adds the way to verify.

1. **Verify link.** Email and password sign-up queues an `auth.verifyEmail` job through `packages/email-client` (T-220). The job carries the userId, never the address. The worker looks up the address. The link is signed, single-use and expires after 24 hours. Only a hash of the token is stored.
2. **Verify route.** Opening a valid link sets `emailVerified = true` and calls `grantSignupBonus` once. The existing `signupBonusGrantedAt` guard makes a repeat call a no-op. An expired, used or forged link changes nothing and shows "this link has expired" with a resend button. An already-verified user clicking again sees "already verified".
3. **Resend.** A signed-in unverified user can request a new link. Each new link replaces the old one. Rate limit: 1 per minute and 5 per day per account. When over the limit, say when they can try again.
4. **Prompt.** A signed-in unverified email user sees a "verify your email" prompt, with the address shown masked and a resend button: (a) on sign-in, (b) when a draft is refused for lack of Ink, and (c) at checkout. Wording comes from Madhuri; layout from Rajesh's spec.
5. **Checkout.** Razorpay order creation refuses an unverified email user, with a clear error code the web app turns into the prompt in 4. Google users and verified users are unaffected.
6. **Google link (Shashank's question, decided).** When an existing email user links Google, linking also calls `grantSignupBonus` once. They count as verified through `googleId` (T-351), and the guard keeps it at one grant.
7. **Dry run.** Until the founder's SES session is done, the worker in dry-run mode logs that a verify email was sent, with the userId only and no address or token. Tests pass without SES.
8. **No PII.** Logs, Sentry and the relay never carry the address, the token or the link.

Out of scope: tightening sign-up rate limits at the gateway (Arjun's item 4, separate ticket), password reset, and the welcome email.

## Arjun (12 Oct 2026): architecture, Mahak's (1)-(4) approved with four conditions

1. **Typed, not loosened:** `EnqueueEmailInput` becomes a union; the `auth.verifyEmail` member is `{ template, userId }` with no `to`, every other template keeps `to` required. Do not make `to` optional for all.
2. **Mint route** `POST /internal/verify-email/mint { userId }`, guarded by `INTERNAL_SECRET` (constant-time compare). It returns **409 and mints nothing** when the user is already verified or is a Google account; the worker then drops the job without sending. Newest link wins on a BullMQ retry, as proposed. The response (email, name, link) is never logged by either side.
3. **The gateway must not reach `/internal/*`.** Auth mounts its routes at `/`, and the gateway proxies `/api/auth/*` to it, so `/api/auth/internal/verify-email/mint` reaches auth today, protected only by the secret. Add a gateway rule before every proxy: any path containing `/internal/` → 404. Test it. This also covers T-115c's `/internal/erase-user`. `apps/gateway/src/app.ts` needs to be on your claim.
4. **Resend cap** (promised to AWS in the SES production-access case): enqueue at most 1 verify mail per user per 60 s and 5 per 24 h, counted in Redis at the enqueue site. Over the limit → 429 with a fixed message, nothing sent.
- (3) `AUTH_SERVICE_URL` in the worker's fail-fast list: yes. Founder: add it to the server `.env.production` with the other email env (I'll add it to the email doc's step 7).
- (4) Billing reading `emailVerified` / `authProvider` / `googleId` from the shared `users` collection: yes for v1. Read those fields only, never write; it is the same coupling billing already has.

## Notes (Priya, 13 Oct 2026, review round 1)

- AC2: a signed-out user opening an already-used link sees "This link has expired. Sign in to send a new one." (Ajay's signed string). Used tokens are not remembered. Signed-in users get "already verified" through /me. Accepted.
- Round 2 adds two safety items: verification refuses deactivated users, and the worker refuses a real send while the footer still has the [registered address]/[PIN] placeholders.
- Follow-ups: T-377 (Referrer-Policy on /verify-email; query strings stripped from nginx logs).
