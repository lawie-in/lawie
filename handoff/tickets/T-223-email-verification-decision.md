# T-223 — Do we verify a new user's email?

| Field          | Value |
| -------------- | ----- |
| Phase          | 0 — Prep |
| Owner          | Arjun and Vikram (recommend), Founder (decides), then Lead (build) |
| Mode           | Decision first |
| Status         | Decided: option B (Priya, on the founder's delegation, 11 Oct 2026). Needs acceptance criteria and T-220 |
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
| Free allowance per new account | 5 Ink, one-time (`inkTopup: 10` units) | `apps/auth/src/services/credit-bonus.service.ts` `grantSignupBonus` | Bail and consumer drafts cost 2 Ink, so 3 to 5 drafts per account |
| Ink per draft | 1 by default, 2 for bail and consumer | `apps/drafting/src/services/credits.service.ts` `TEMPLATE_COST` | Not yet the drops formula (T-004) |
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
