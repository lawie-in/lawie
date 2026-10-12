# T-222 — A new user gets a welcome email

| Field          | Value |
| -------------- | ----- |
| Phase          | 0 — Prep |
| Owner          | Madhuri (copy), Ajay (checks claims), Lead (build), Anushka (verdict) |
| Mode           | Copy first, then build, full chain (auth, email-worker) |
| Status         | To do. Needs Madhuri's copy |
| Size           | S (0.5 day) |
| Depends on     | T-220 to send for real. T-225 |
| Gate           | Before v1 go-live. Nice to have, not a blocker |
| Branch         | feature/t-222-welcome-email |
| Legal sign-off | Ajay checks the copy for claims (BCI, no promise of accuracy) |
| Created        | 2026-10-11 |
| Source         | Founder asked for email scope, 11 Oct 2026. Priya's survey of `apps/email-worker` and `packages/email-client` |

## Problem

`auth.welcome` is a stub template and nothing sends it.

## Acceptance criteria

1. Sign-up by email and first Google sign-in each send `auth.welcome` once, never twice for the same user.
2. The copy is Madhuri's, checked by Ajay: what Lawie does, the free drafts the user has, how to start, how to get help. No claim of legal accuracy.
3. Sign-up still succeeds if the email cannot be queued; the failure is logged by user id only.

## Out of scope

- Any drip or marketing sequence

## References

- `apps/email-worker/src/templates/auth/welcome.tsx`, T-225

## Copy (Madhuri, 11 Oct 2026)

For Ajay's claims check. Written inside T-225 (Ajay sign-off, 11 Oct 2026), AC1a, AC1c and AC3. Words in `{braces}` are data the template fills in. Onboarding only, one email, transactional: no offers, no referral, no review ask, no tips series, no unsubscribe link.

Audience: Phase 1 is Google sign-in only (founder decision, 17 May 2026), so this copy is for Google sign-ups and says nothing about passwords. Sent once, on first Google sign-in.

Two values to confirm before Ajay checks it:
- `{freeDrafts}`: the free drafts a new user gets on the day this ships. Code today says 5 (`SIGNUP_BONUS_CREDITS` in `apps/auth/src/services/credit-bonus.service.ts`). Vikram confirms the number (T-225 AC3); the template should read it from that constant, not hard-code it.
- The document list in the "What you can draft" line must match live templates. I wrote bail applications, legal notices and agreements; Priya to confirm against the live template set and cut any that are not live.

What I removed from the stub on purpose: "court-ready", "formatted to your court's rules", "in under five minutes" (speed and accuracy promises, AC3), "AI legal drafting workspace" (no AI hype). The stub's disclaimer is replaced by Ajay's exact line.

| Part | Copy | Chars |
| --- | --- | --- |
| Subject | Welcome to Lawie, {name} | 18 + name |
| Preheader | Your {freeDrafts} free drafts are ready. Here's how to start. | 58 with "5" |

Subject variants: A "Welcome to Lawie, {name}" (18 + name, recommended) · B "Your Lawie account is ready" (27) · C "Welcome to Lawie" (16)

Body:

```
Hello {name},

Welcome to Lawie. Your account is ready.

Lawie helps you prepare a first draft faster, so you spend less time copying from old files. What you can draft: bail applications, legal notices and agreements, using BNS, BNSS and BSA.

You have {freeDrafts} free drafts to try it.

How to start:
1. Sign in with Google and pick a document.
2. Answer a few questions about the matter.
3. Review the draft, edit it, and download it.

[Start your first draft]   -> {loginUrl}

Need help? Write to contact@lawie.in and we will get back to you.

Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.

Team Lawie
```

Button variants: A "Start your first draft" (22, recommended) · B "Open Lawie" (10) · C "Sign in with Google" (19)

Footer (verbatim from T-225 AC1c, no unsubscribe link):

```
Lawie (Sole Proprietorship), [registered address], Patna, Bihar [PIN]
You are receiving this because you have a Lawie account.
Help: contact@lawie.in · Data and privacy requests: privacy@lawie.in
Privacy Policy: https://lawie.in/privacy · Terms: https://lawie.in/terms
```

Build notes:
- Send from `Lawie <noreply@lawie.in>`. The help line names contact@lawie.in because noreply is not monitored.
- Disclaimer line stays in the body, not only in small print (mandatory per T-225 AC1c).
- Risk (from T-225): the registered address is a placeholder until the founder fills it.

## Ajay claims check (11 Oct 2026)

Checked against T-225 (AC1a, AC1b, AC1c, AC3) and, read-only, against `apps/drafting` and `apps/auth` on `develop_staging`. Result: **not signed yet. One Blocker, two required changes.** Apply the three changes below verbatim and the copy is Approved without coming back to me.

### What I checked in the code

- Live templates: all 92 files in `apps/drafting/src/config/document-rules/*.json` load into the registry (`template-promoter.ts`, `loadAllDocRules`) and every one is promoted with `plan_access: 'free'`, so a new free user sees all of them (`routes/templates.routes.ts`). Bail (6: regular, anticipatory, before magistrate, interim, default, cancellation), legal notices (8) and agreements (rent, NDA, MOU, service, loan, employment and others) are all live. The line is accurate, but it lists 3 of about 15 families, so it should not read as the full list.
- Free allowance: `SIGNUP_BONUS_CREDITS = 5` (`apps/auth/src/services/credit-bonus.service.ts`) grants 5 **credits**, not 5 drafts. The enforced price (`apps/drafting/src/services/credits.service.ts`, `TEMPLATE_COST`) charges 2 credits for `bail_regular` and `bail_anticipatory`, 1 for everything else. A user who drafts regular bail applications gets 2 drafts, not 5.
- BNS/BNSS/BSA: the bail templates cite BNSS/BNS. Agreements and civil notices do not (`nda`, `rent_agreement`, `legal_notice_breach_of_contract`: no Sanhita references; the s.138 notice is under the NI Act). "using BNS, BNSS and BSA" after the whole list says agreements use the Sanhitas.

### Findings

| # | Item | Mark | Basis |
| --- | --- | --- | --- |
| 1 | "{freeDrafts} free drafts" (preheader and body): overstates the allowance; 5 credits is 2 to 5 drafts | **Blocker** | T-225 AC3 last bullet; CPA 2019 s.2(28); CCPA Misleading Ads Guidelines 2022 |
| 2 | "using BNS, BNSS and BSA" attached to agreements and notices | **Risk**, required change | T-225 AC3 ("accurately"); CPA 2019 s.2(28) |
| 3 | "prepare a first draft faster": unsubstantiated comparative speed claim (same class as the removed "in under five minutes") | **Risk**, required change | T-225 AC3; CCPA Guidelines 2022 (claims must be substantiated) |
| 4 | Document list (bail applications, legal notices, agreements) | Acceptable with change 2 | All three families live and free today |
| 5 | Disclaimer line, verbatim, in the body | Approved | T-225 AC1c |
| 6 | Footer | Approved; **Risk**: `[registered address]` and `[PIN]` are placeholders. Must be filled before send | T-225 AC1c |
| 7 | No case details, no draft or document title, no ID numbers, name in greeting and subject only | Approved | T-225 AC1a |
| 8 | Transactional status: onboarding only, no offer, referral, review ask or tips; no unsubscribe link | Approved | T-225 AC1b; DPDP s.7(a) |
| 9 | BCI: no client-getting, practice-growth, endorsement, "approved", testimonial or legal-advice language | Approved | BCI Rules Pt VI Ch II r.36; T-225 AC3 |
| 10 | Sender `Lawie <noreply@lawie.in>` with monitored contact@ in help line and footer | Approved | T-225 AC1c |
| 11 | Subject A/B/C, button A/B/C, "Here's how to start", steps 1 to 3, help line | Approved, any variant | |

### Exact changes (Madhuri applies verbatim)

1. **Preheader.** Replace `Your {freeDrafts} free drafts are ready. Here's how to start.` with:
   `Your {freeCredits} free credits are ready. Here's how to start.`
2. **Body, allowance.** Replace `You have {freeDrafts} free drafts to try it.` with:
   `You have {freeCredits} free credits to try it. Each draft uses 1 or 2 credits, and Lawie shows the cost before you start.`
   Build: `{freeCredits}` reads `SIGNUP_BONUS_CREDITS`; the "1 or 2" must match `TEMPLATE_COST` on the day this ships. If either changes, this line comes back to me.
3. **Body, what Lawie does.** Replace the paragraph starting `Lawie helps you prepare a first draft faster` with:
   `Lawie helps you prepare a first draft for you to review, so you spend less time copying from old files. You can draft bail applications, legal notices, agreements and other documents. Criminal drafts use BNS, BNSS and BSA.`

Condition: the "shows the cost before you start" clause in change 2 is a product claim. Priya confirms the draft screen shows the credit cost before generation; if it does not, drop that clause and keep the first sentence only.

### Not in T-222 scope, flagged to Priya and Vikram

- Price mismatch in code: 58 doc-rule JSONs carry `"creditsCost": 2`, which `GET /templates` returns to the UI, but enforcement (`TEMPLATE_COST`) charges those templates 1 credit, and charges `bail_regular` 2 while its JSON has no cost. Displayed price must equal charged price (CPA 2019 s.2(47) unfair trade practice). Needs a ticket before v1.

Signed (conditional on changes 1 to 3 applied verbatim and the footer address filled): Ajay (CLO), 11 Oct 2026.

## Copy (Madhuri, final, 11 Oct 2026)

Ajay's changes 1 to 3 applied verbatim. The earlier draft above stays as it was. Everything else is unchanged from that draft and approved in Ajay's findings 5 to 11.

**Change 2 condition: the clause is dropped.** Ajay's change 2 keeps "and Lawie shows the cost before you start" only if Priya confirms the draft screen shows the credit cost before generation. On `develop_staging` today it does not: the web app shows a cost only in `PaywallModal`, after a user without enough Ink tries to generate (`apps/web/src/components/intake/OneFlow.tsx`). Nothing in `apps/web` reads `creditsCost`. So, per Ajay's fallback, only the first sentence stays. When T-227 AC3 ships and Priya confirms, the clause goes back in exactly as Ajay wrote it, with no further check needed.

**Open item for Ajay: "credits" or "Ink".** The app calls the unit **Ink** (header pill, paywall, low-balance and failed-generation modals). Ajay's verbatim wording says "credits". If the email says "credits" and the app says "Ink", a new user sees two names for the same thing. Swapping the word is a change to his verbatim lines, so it needs his OK. Until he gives it, the copy below says "credits".

Vikram's numbers (T-227): 5 sign-up credits = 5 Ink. That buys 5 short drafts, or 2 long drafts and 1 short one. A draft is charged only when it succeeds. Ajay's line ("Each draft uses 1 or 2 credits") is true under Vikram's v1 rule and today's `TEMPLATE_COST`. **I did not use Vikram's suggested line** ("5 free Ink: up to 5 drafts. Notices and affidavits use 1 Ink; bail applications, petitions, plaints and agreements use 2.") for two reasons:
- It is not Ajay's wording, and "up to 5 drafts" brings back the drafts framing Ajay marked as a Blocker.
- "agreements use 2" contradicts Vikram's own 1-Ink list, which includes `rent_agreement`, `nda`, `mou` and `service_agreement`.

| Part | Copy | Chars |
| --- | --- | --- |
| Subject (A, recommended) | Welcome to Lawie, {name} | 18 + name |
| Preheader | Your {freeCredits} free credits are ready. Here's how to start. | 51 with "5" |
| Button (A, recommended) | Start your first draft | 22 |

Subject variants: B "Your Lawie account is ready" (27) · C "Welcome to Lawie" (16). Button variants: B "Open Lawie" (10) · C "Sign in with Google" (19). Ajay approved all variants.

Body:

```
Hello {name},

Welcome to Lawie. Your account is ready.

Lawie helps you prepare a first draft for you to review, so you spend less time copying from old files. You can draft bail applications, legal notices, agreements and other documents. Criminal drafts use BNS, BNSS and BSA.

You have {freeCredits} free credits to try it. Each draft uses 1 or 2 credits.

How to start:
1. Sign in with Google and pick a document.
2. Answer a few questions about the matter.
3. Review the draft, edit it, and download it.

[Start your first draft]   -> {loginUrl}

Need help? Write to contact@lawie.in and we will get back to you.

Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.

Team Lawie
```

Footer (verbatim from T-225 AC1c, unchanged):

```
Lawie (Sole Proprietorship), [registered address], Patna, Bihar [PIN]
You are receiving this because you have a Lawie account.
Help: contact@lawie.in · Data and privacy requests: privacy@lawie.in
Privacy Policy: https://lawie.in/privacy · Terms: https://lawie.in/terms
```

Build notes:
- `{freeCredits}` reads `SIGNUP_BONUS_CREDITS` (`apps/auth/src/services/credit-bonus.service.ts`). Do not hard-code it. `{freeDrafts}` is retired.
- "1 or 2" must match the charged price on the day this ships (T-227 lands first, per its Gate). If either value changes, the line goes back to Ajay.
- Do not send until the founder fills `[registered address]` and `[PIN]` (Ajay finding 6).
- Before publishing: Meera's sign-off, and Ajay's answer on "credits" vs "Ink".

## Priya decisions (11 Oct 2026)

1. The unit is "Ink" in the email, the same word the app shows. Ajay to confirm the one-word swap from "credits" before build.
2. The cost-before-you-start line stays out until T-227 AC3 ships a cost screen.
3. Ships only after T-220 (sending) and T-227 (prices), and with the real registered address in the footer (founder).


## Copy (Madhuri, password variant, 11 Oct 2026)

For Ajay's claims check, then Meera. Founder, 11 Oct 2026: email and password sign-up ships in v1 alongside Google, so the welcome email goes to both (AC1).

**Recommendation: one version for everyone, no variant.** Only one line in the final copy names the sign-in method (step 1), plus button variant C. Making them neutral is simpler than two templates and a branch in the build.

| Part | Final copy above (Google only) | Neutral version (all sign-ups) | Chars |
| --- | --- | --- | --- |
| Step 1 | 1. Sign in with Google and pick a document. | 1. Sign in to Lawie and pick a document. | 43 → 40 |
| Button variant C | Sign in with Google | Retired. Use A "Start your first draft" (22, recommended) or B "Open Lawie" (10) | |

Everything else in "Copy (Madhuri, final, 11 Oct 2026)" stays as it is: subject, preheader, body, disclaimer, footer and build notes. That includes Priya decision 1: "credits" becomes "Ink" in both places once Ajay confirms the swap; this variant does not change that.

If the founder prefers to name the method, a short variant line for password sign-ups only:
- Step 1, password: `1. Sign in with your email and password, and pick a document.` (61). Google sign-ups keep the final copy's step 1. The template then needs a `signInMethod` value; I don't recommend it.

Checks:
- Nothing else mentions Google or passwords: subject, preheader, body and footer are method-neutral already.
- "Your account is ready" stays true for password sign-ups: T-223 chose option B (verify before buying or the second free draft), so the first draft needs no verification. If T-223 moves to A, this line and step 1 come back to me.
- No password, ever, in this email (T-225 AC1a). `{name}` comes from the sign-up form for password users (required field in `registerSchema`).
- Send once per user, on email sign-up or first Google sign-in (AC1).

## Ajay claims check (11 Oct 2026, night)

Checked "Copy (Madhuri, password variant, 11 Oct 2026)" against my three changes above, T-225, T-223's decision and, read-only, the code on `develop_staging`.

### My three changes

| # | Change | Still holds? |
| --- | --- | --- |
| 1 | Preheader in credits, not drafts | Yes. `SIGNUP_BONUS_CREDITS = 5` unchanged. Word swap below |
| 2 | "Each draft uses 1 or 2 ..." | Yes for the price: `TEMPLATE_COST` still charges 1 or 2. **No longer complete for password sign-ups**: see change 5 |
| 3 | What-Lawie-does paragraph | Yes, unchanged and accurate |

### Answers and required changes (Madhuri applies verbatim)

4. **"credits" to "Ink": Approved** (Priya decision 1). The app says "5 Ink" everywhere. Use:
   - Preheader: `You have {freeCredits} free Ink. Here's how to start.`
   - Body: `You have {freeCredits} free Ink to try it. Each draft uses 1 or 2 Ink.`
5. **Verification line: Blocker without it.** Under T-223 option B, a password user can use only the first draft until they verify their email; Google users are verified. "You have 5 free Ink to try it" with no condition hides a material limit (CPA 2019 s.2(28); CCPA Misleading Ads Guidelines 2022, conditions must be disclosed). Add, directly after the line in change 4:
   `If you signed up with email and password, verify your email address before your second draft.`
   This keeps one template for everyone, as Madhuri recommends. If T-223 changes, this line comes back to me.
6. **Step 1 neutral version: Approved.** `1. Sign in to Lawie and pick a document.` Button C retired. The password-only step 1 is also acceptable but not needed.
7. **Risk, recommended (not blocking):** a password sign-up is not verified, so this email can reach someone who never signed up. Add before the disclaimer: `Didn't create a Lawie account? Write to contact@lawie.in and we will look into it.` Keep it transactional, no unsubscribe.

Unchanged and still Approved: findings 5 to 11 above (disclaimer, footer with the placeholder Risk, no case data, transactional status, BCI, sender, variants). "Your account is ready" is true for password users under option B.

Signed: Ajay (CLO), 11 Oct 2026, night. Conditional on changes 4 and 5 applied verbatim, the footer address filled, and T-220 and T-227 landing first.

## Priya (11 Oct 2026, night)

Ajay's change 2 needs one more line for password sign-ups: how to verify the email (T-223 option B). Madhuri adds it once T-223's acceptance criteria are written. Ships with T-223.

## Ajay approved the email copy (12 Oct 2026, `handoff/legal/emails-waitlist-panel-signed.md`)

Draft in `handoff/marketing/copy/emails.md`. The Ink swap is fine, but the email must not ship before T-227 merges (T-227 is merged: 12 Oct). Hindi welcome is faithful: keep the English disclaimer first, Hindi after. The verification email (24 h, single-use) is approved as a draft: "second draft / daily bonus / buy Ink" must equal what T-223 builds; delete the daily-bonus clause if it is not live. Subject C "One step left" is rejected. The reset page must answer the same whether or not an account exists. Footer address and PIN: the founder's.
