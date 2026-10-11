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
