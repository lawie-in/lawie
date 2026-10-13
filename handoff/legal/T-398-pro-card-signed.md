# T-398: pricing page, Pro card (signed, conditional)

Signed: Ajay (CLO), 13 Oct 2026 IST. Source: `handoff/marketing/copy/pricing-pro-card-t398.md`, Option A. Checked against `apps/billing/src/config/credit-skus.ts` and `apps/billing/src/services/ink-ledger.service.ts`.

## Approved now (monthly view)

| Part | Exact text |
|---|---|
| Card title | `Pro` |
| Subline | `More Ink each month` |
| Price, monthly | `₹1,999 /month` (matches pro_monthly, 1999) |
| Bullet 1 | `150 Ink/month` (matches inkPerCycle 150 on a monthly renewal) |
| Bullet 2 | `Everything in Solo` (no "plus") |
| Bullet 3 | `Ink refills every month` |
| Bullet 4 | `Top-up packs available anytime` |
| Button | `Sign up to choose Pro` (or `Choose Pro` if it goes straight to checkout) |
| Deleted | `No watermark on exports`, `Priority email support`, `Early access to new templates`, and any popular or best-value badge |

## Held: every yearly line

Held: `or ₹19,990/year — save 2 months`, `₹19,990 /year` and `₹3,998 saved vs paying monthly`.

`grantSubscriptionInk` grants Ink on each **billing renewal**. A yearly plan renews once a year, and I find no monthly grant job for yearly plans in `apps/billing/src` (the `// monthly drip` comment on solo_yearly has no code behind it that I can see). If that is right, a yearly buyer gets 150 Ink once a year. Then "150 Ink/month", "Ink refills every month" and "save 2 months" would be false for them, and so would the signed FAQ line "Solo and Pro plans refill Ink every month" for Solo yearly.

The yearly toggle (Solo and Pro) stays off the page until **one** of these holds:
1. A monthly grant for yearly plans exists and a test pins it (Arjun/Vikram). The yearly lines are then approved as written above.
2. The yearly lines are rewritten to state the true yearly grant, and I sign that new text.

The rest of Option A stands. Option B is not needed.

## Free card and hero (Madhuri's "Free card" section), 13 Oct 2026

| Part | Exact text | Ruling |
|---|---|---|
| Price | `₹0` | Drop `/lifetime` next to the price. The Ink line already says lifetime, and "₹0/lifetime" reads like unlimited use for life. |
| Ink line | `5 Ink on sign-up, once your email is verified (lifetime)` | Approved |
| 375 px alternates | `5 Ink once your email is verified (lifetime)` · `5 Ink, once your email is verified` | Approved, in that order of preference |
| Templates line | `Every document type on Lawie` | Approved (Free is not gated by type, per Tanvi) |
| Hero subline | `Start with 5 free Ink once your email is verified. Buy more when you need it.` | Replaces `Start with 5 free Ink. Buy more when you need it.` The condition must stand next to the offer. |
| Free button | `Start with 5 free Ink` | Approved; the condition is on the card and the hero. |
