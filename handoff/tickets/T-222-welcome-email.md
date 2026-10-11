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
