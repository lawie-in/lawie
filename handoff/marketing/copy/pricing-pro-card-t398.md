# Pricing page: the Pro plan card (T-398)

Madhuri, 13 Oct 2026. **Draft. Vikram to confirm plan name/price, then Ajay signs.** Sources: `handoff/tickets/T-398-pricing-pro-plan-card.md`, `handoff/tickets/vikram-gtm-decisions.md` (Pro Rs 1,999 is under review, stays on the page, goes in no ad or other copy), `copy/pricing.md` (rows 15 to 19, signed), `handoff/legal/site-copy-t252-and-help-text-signed.md` (Pro stays out of all other copy). Current lines are quoted from `apps/web/src/app/(marketing)/pricing/page.tsx`, read only, 13 Oct.
Rules: plain English, no "Priority support", no "Early access", no watermark claim, no "Most popular" or "Best value", no "free" except with "5 Ink", no security or time claim, no discount. Prices are the live ones, unchanged. The "[Vikram to confirm]" tag is a note in this file, not page text.

## Option A: keep the name "Pro", only true lines

| Part | Copy | Chars | Status |
| --- | --- | --- | --- |
| Card title | Pro | 3 | Vikram to confirm plan name/price, then Ajay signs |
| Subline | More Ink each month | 19 | Vikram to confirm plan name/price, then Ajay signs |
| Price, monthly view | ₹1,999 /month | 13 | [Vikram to confirm] exactly as live |
| Price alt, monthly view | or ₹19,990/year — save 2 months | 31 | [Vikram to confirm] exactly as live |
| Price, yearly view | ₹19,990 /year | 13 | [Vikram to confirm] exactly as live |
| Price alt, yearly view | ₹3,998 saved vs paying monthly | 30 | [Vikram to confirm] exactly as live |
| Bullet 1 | 150 Ink/month | 13 | [Vikram to confirm] as live |
| Bullet 2 | Everything in Solo | 18 | Vikram to confirm plan name/price, then Ajay signs |
| Bullet 3 | Ink refills every month | 23 | Signed FAQ wording ("refill Ink every month") |
| Bullet 4 | Top-up packs available anytime | 30 | Signed FAQ wording ("buy top-up packs anytime") |
| Button | Sign up to choose Pro | 21 | Never "free". Same pattern as Solo; the link goes to /login. "Choose Pro" if it goes to checkout |

## Option B: neutral name

| Part | Copy | Chars | Status |
| --- | --- | --- | --- |
| Card title | Higher volume | 13 | Vikram to confirm plan name/price, then Ajay signs |
| Title alternates | More Ink · Solo Plus | 20 | Vikram to confirm plan name/price, then Ajay signs |
| Subline | 150 Ink each month | 18 | Vikram to confirm plan name/price, then Ajay signs |
| Price lines | Same four lines as option A (₹1,999 /month · or ₹19,990/year — save 2 months · ₹19,990 /year · ₹3,998 saved vs paying monthly) | 126 | [Vikram to confirm] exactly as live |
| Bullet 1 | 150 Ink/month | 13 | [Vikram to confirm] |
| Bullet 2 | Everything in Solo | 18 | Vikram to confirm plan name/price, then Ajay signs |
| Bullet 3 | Ink refills every month | 23 | Signed FAQ wording |
| Bullet 4 | Top-up packs available anytime | 30 | Signed FAQ wording |
| Button | Sign up for 150 Ink/month | 25 | Never "free" |

## Before and after (`pricing/page.tsx`)

| Line in `pricing/page.tsx` | Current (exact) | After |
| --- | --- | --- |
| 166 | `<div className="plan-name">Pro</div>` | `Pro` (A) · `Higher volume` (B) |
| 49-50, 171 | `const proPrice = period === 'monthly' ? '₹1,999' : '₹19,990';` and `{proAlt}` | No change in A or B. [Vikram to confirm] ₹1,999 / ₹19,990 |
| 53-54 | `period === 'monthly' ? 'or ₹19,990/year — save 2 months' : '₹3,998 saved vs paying monthly'` | No change [Vikram to confirm] |
| (none) | (no subline on the card today) | Subline as above |
| 174 | `150 Ink/month` | No change [Vikram to confirm] |
| 176 | `Everything in Solo, plus` | `Everything in Solo` (the "plus" goes: nothing true is left to add). In the page this is `<li className="head">`; as a bullet it needs a check mark, Rajesh's call |
| 178 | `No watermark on exports` | Delete the row (no watermark on any plan) |
| 181 | `Priority email support` | Delete the row (no priority route exists; not approved) |
| 184 | `Early access to new templates` | Delete the row (no mechanism exists; not approved) |
| (new) | (none) | `Ink refills every month` and `Top-up packs available anytime` |
| 188 | `Get Pro <ArrowRight strokeWidth={1.5} />` | `Sign up to choose Pro` (A) · `Sign up for 150 Ink/month` (B), arrow stays |
| 42 (FAQ, signed) | `… Solo and Pro plans refill Ink every month. …` | A: no change. B: "Solo and Pro plans" must change to match the new name; Ajay signed this FAQ, so it goes back to him |

Other places that say "Pro" (Priya, not in this copy): `UpgradeSuccessModal.tsx`, `HeaderCreditPill.tsx`, `Sidebar.tsx`, the "Upgrade to Pro" notice (being deleted in T-252), billing and Razorpay plan names, receipts. Under B they must all match, or the page and the receipt name different plans.

## Recommendation

Does "Pro" mislead today? On the current card, yes. "Pro" with "Everything in Solo, plus" promises extras. The three extras are a watermark-free export (every plan has that), priority support and early access (neither exists). Once those go, the only true difference is 150 Ink a month against 50. "Pro" then names a tier by status, not by what it is, and it is a tier Vikram may re-tier after two weeks of token data (it is under his 60% margin target). A name that may change should not be printed on receipts and in the FAQ.
- **Recommend B**, with "Higher volume" (or "More Ink") as the title, if Vikram agrees the plan can be renamed in billing too. It says exactly what the plan is.
- **A is acceptable** if Vikram keeps the name "Pro": with the four bullets above it makes no false claim. The risk left is only that the name suggests features that are not there; the "Everything in Solo" line and no "plus" keep that small.
- Either way the card stays on the pricing page only, with no price in any ad or post.

Vikram to confirm plan name/price, then Ajay signs.


## Free card

Madhuri, 13 Oct. Re-words the two Free-card lines Meera named. Current lines quoted from `apps/web/src/app/(marketing)/pricing/page.tsx`, read only.

| Line in `pricing/page.tsx` | Current (exact) | After | Chars (after) | Status |
| --- | --- | --- | --- | --- |
| 118 | `All templates` | Every document type on Lawie | 28 | Ajay to sign |
| 115 | `5 Ink — forever` | 5 Ink on sign-up, once your email is verified (lifetime) | 56 | Ajay to sign |
| 113 | `₹0<small>/lifetime</small>` | `₹0` (drop `<small>/lifetime</small>`; the "(lifetime)" stays in the 5 Ink line) | n/a | Ajay's rule; Ajay to sign |

Where the wording comes from:
- "Every document type on Lawie" is Ajay's exact phrase in `handoff/legal/T-366-tools-legal-lines-signed.md`, Addendum 2, item 2 (the FAQ free-tier line). It is not in `site-copy-t252-and-help-text-signed.md`; there F2 only says "All document types" goes if Free is gated by type. The condition carries over: it holds only if Free is not gated by type (Tanvi checks); if it is gated, the line goes.
- "5 Ink on sign-up, once your email is verified (lifetime)" follows Ajay's same file: "5 Ink on sign-up, once your email is verified (lifetime)". Google sign-ups count as verified, so it is true for both sign-up kinds (T-351).
- Shorter alternates for the plan-alt line if it does not fit at 375 px: `5 Ink once your email is verified (lifetime)` (44) · `5 Ink, once your email is verified` (34).

Knock-on lines (Ajay's T-366 rule: every "5 Ink on sign-up" gets "once your email is verified"). These already contain "5 Ink" next to "free", so "free" is fine, but the verification condition is missing:
- Pricing hero subline row 7 in `copy/pricing.md`: `Start with 5 free Ink. Buy more when you need it.` and the Free button `Start with 5 free Ink`. Buttons stay short; the condition sits on the card line. Ajay to rule whether the hero needs it too.
- `copy/pricing.md` row 8 (`5 Ink on sign-up · No card required`) is replaced by the Free-card line above.
