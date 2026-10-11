# Pricing page copy — lawie.in/pricing (T-238 and follow-on)

Owner: Madhuri (copy). Signed lines: Meera (T-238 line), Ajay (`handoff/legal/marketing-s1-claims-signed.md`), Vikram (`handoff/tickets/vikram-gtm-decisions.md`). Build: a lead, through Priya.
File: `apps/web/src/app/(marketing)/pricing/page.tsx` (read only. Nothing here has been edited).
Status: **DRAFT for Priya.** Rows marked "Signed" use wording already signed; every other row needs Ajay's check before build.

## Note for the dev lead (through Priya)

- **Copy only.** String literals and JSX text in `pricing/page.tsx`, plus removing the two badge elements. No logic, no style, no price-calculation changes.
- **T-238** covers rows 1–6 below (Meera, 12 Oct: the badges and the Free-plan lines are part of T-238). T-238 AC2 says "the lead changes only that copy", so Priya should widen T-238's AC2 to rows 1–6, or open a sibling ticket for rows 3–6.
- **New ticket needed** (Priya to number it) for rows 7–14 and for the other public lines in "Grep for Ink" below (home, FAQ, about, pricing metadata).
- **Depends on T-227.** The Ink line is true only once T-227 is merged (shown price = charged price). Ship T-238 after or with T-227.
- Rows 15–19 are plan benefits. Priya (12 Oct): no plan has a watermark (policy, locked by a test), so rows 17–19 are false and must go. Rows 15–16 are unverified (Priya/Vikram) and are out of the clean copy until confirmed.
- After the change, T-238 AC3: `grep -rn "Ink" apps/web/src/app/(marketing)` shows no line that contradicts T-227 (see the grep list below).

## Before → After (`pricing/page.tsx`)

| # | Line | Current (exact) | New | Status |
| --- | --- | --- | --- | --- |
| 1 | 42, FAQ "What is Ink?" answer | `Ink is Lawie's credit unit. Each document you generate uses 1 Ink. The Free plan gives you 5 Ink (lifetime). Solo and Pro plans refill Ink every month. You can also buy top-up packs anytime.` | `Ink is Lawie's credit unit. Most documents use 2 Ink; short ones, such as most notices and affidavits, use 1. You're charged only after a draft is generated; a failed generation is not charged. The Free plan gives you 5 Ink (lifetime). Solo and Pro plans refill Ink every month. You can also buy top-up packs anytime.` | **Signed** (Ajay + Meera, T-238). Replaces Meera's earlier "…when a draft is ready" version |
| 2 | 202, "Why Ink?" panel | `Less than ₹16 per document on Solo. Buy extra packs anytime.` | `Most documents use 2 Ink, short ones 1. Buy extra packs anytime.` | **Signed** (Ajay + Vikram) |
| 3 | 143, Solo card badge | `Most Popular` | *(remove the badge element)* | Meera, T-238. No usage data supports "most popular" |
| 4 | 224, top-up badge on ₹199 | `POPULAR` | *(remove the badge element)* | Meera, T-238. Same reason |
| 5 | 121, Free plan list | `Court formatting` | `Edit every draft before you download` | New, Ajay to check. No court-format claim (T-140 not started; "formatted to your court" banned) |
| 6 | 124, Free plan list | `BNS validation` | `Criminal drafts cite BNS, BNSS and BSA` | Ajay's signed line. "Validation" is banned |
| 7 | 99, hero subline | `Ink credits — start free, buy more when you need it.` | `Start with 5 free Ink. Buy more when you need it.` | Ajay rule: "free" next to "5 Ink" |
| 8 | 115, Free plan sub-price line | `5 Ink — forever` | `5 Ink on sign-up` | "Forever" can read as a monthly or renewing allowance. It is a one-time grant (`SIGNUP_BONUS_CREDITS`) |
| 9 | 118, Free plan list | `All templates` | `All document types (more than 90)` | Ajay signed "more than 90". Optional: "All templates" is true too |
| 10 | 134, Free plan button | `Start Free` | `Start with 5 free Ink` | Ajay rule: "free" next to "5 Ink" |
| 11 | 167, Solo plan button | `Start Drafting Free` | `Start with 5 free Ink` | Same rule. Solo has no free trial, so the button must not read as "Solo free". Variant: `Choose Solo` if checkout from this button is wired (Priya) |
| 12 | 113, Free plan price suffix | `/lifetime` | `/lifetime` *(no change)* | Listed for completeness; true (one-time 5 Ink) |
| 13 | 215, top-up section sub | `Buy one-time packs — no subscription required. Available on all plans.` | *(no change)* | True as far as I can see. Ajay to confirm "available on all plans" (incl. Free) |
| 14 | 229, top-up badge on ₹499 | `BEST VALUE` | *(keep, or change to `LOWEST PRICE PER INK`)* | True among top-ups: ₹499/28 ≈ ₹17.8 per Ink vs ₹19.9 (₹199/10) and ₹21.7 (₹65/3). Not a per-document figure. Ajay to decide keep or drop |
| 15 | 160, 186, Solo and Pro lists | `Priority email support` | *(removed from the clean copy)* | **Unverified, Priya/Vikram.** No support queue is known to exist. Keep only if Priya/Vikram confirm it, then Ajay checks the wording |
| 16 | 163, 189, Solo and Pro lists | `Early access to new templates` | *(removed from the clean copy)* | **Unverified, Priya/Vikram.** No early-access mechanism is known. Keep only if confirmed, then Ajay checks |
| 17 | 130, Free plan list | `Lawie watermark on exports` | *(drop the row)* | Priya: there is NO watermark on any plan (policy, locked by a test). Never claim one. The Free list already has `PDF / DOCX export` (clean copy: "Download in Word or PDF"), so nothing replaces it |
| 18 | 157, Solo plan list | `No watermark on exports` | *(drop the row)* | Same. Not a paid benefit. Nothing true is left to say here, so the row goes |
| 19 | 184, Pro plan list | `No watermark on exports` | *(drop the row)* | Same |

Prices on the page (Vikram, 12 Oct):

| Line | Current | Status |
| --- | --- | --- |
| 49, Solo | `₹799` / `₹7,990` | **Final** (Vikram). No change |
| 52, Solo alt | `or ₹7,990/year — save 2 months` / `₹1,598 saved vs paying monthly` | Final. Arithmetic checks: 12 × ₹799 = ₹9,588; minus ₹7,990 = ₹1,598 = 2 months |
| 50, Pro | `₹1,999` / `₹19,990` | **[under review, Vikram]**. Stays on the page as it is; goes in no other copy, no ad, no post |
| 54, Pro alt | `or ₹19,990/year — save 2 months` / `₹3,998 saved vs paying monthly` | **[under review, Vikram]**. Arithmetic checks (12 × ₹1,999 = ₹23,988; minus ₹19,990 = ₹3,998) |
| 220 / 225 / 230, top-ups | `₹65` 3 Ink · `₹199` 10 Ink · `₹499` 28 Ink | **Final** (Vikram). No change |

The "[under review, Vikram]" tags are notes in this file only. They are **not** page text.

## Clean pricing page copy (after the change)

**Hero**
- Eyebrow: Pricing
- Heading: Simple, transparent pricing.
- Subline: Start with 5 free Ink. Buy more when you need it. (47)

**Toggle:** Monthly / Yearly (unchanged)

**Free**
- Name: Free
- Price: ₹0 /lifetime
- Line: 5 Ink on sign-up
- List: All document types (more than 90) · Edit every line of the draft · Criminal drafts cite BNS, BNSS and BSA · Download in Word or PDF
- Button: Start with 5 free Ink

**Solo** *(no badge)*
- Name: Solo
- Price: ₹799 /month · or ₹7,990/year — save 2 months. Yearly view: ₹7,990 /year · ₹1,598 saved vs paying monthly
- List: 50 Ink/month · Everything in Free *("plus" dropped: nothing verified is left to add. Priority email support and early access to new templates are unverified, Priya/Vikram, rows 15–16)*
- Button: Start with 5 free Ink *(or "Choose Solo", see row 11)*

**Pro** *(page text unchanged; [under review, Vikram])*
- Name: Pro
- Price: ₹1,999 /month · or ₹19,990/year — save 2 months. Yearly view: ₹19,990 /year · ₹3,998 saved vs paying monthly
- List: 150 Ink/month · Everything in Solo *(the current list repeats Solo's items; same unverified benefits, rows 15–16)*
- Button: Get Pro

**Why Ink? panel**
- Heading: Why Ink?
- Line: Most documents use 2 Ink, short ones 1. Buy extra packs anytime. (64)

Variants for the panel line, if Meera wants one more Ink fact there (each needs Ajay; the signed line above is the default):
- A (signed): "Most documents use 2 Ink, short ones 1. Buy extra packs anytime." (64)
- B: "Pay per draft: most documents use 2 Ink, short ones 1. Buy extra packs anytime." (79)
- C: "Most documents use 2 Ink, short ones 1. A failed generation is not charged." (75)

**Top-up packs**
- Eyebrow: Top-up packs
- Heading: Need a few extra Ink?
- Sub: Buy one-time packs — no subscription required. Available on all plans.
- Cards: ₹65 · 3 Ink — ₹199 · 10 Ink — ₹499 · 28 Ink *(BEST VALUE: keep or drop, row 14; POPULAR removed)*

**Pricing FAQ** *("Billing questions, answered.")*
1. Can I cancel anytime? *(unchanged)*
2. Do you offer refunds? *(unchanged)*
3. What payment methods do you accept? *(unchanged)*
4. Do you have a team plan? *(unchanged)*
5. Is GST included? *(unchanged. Vikram's founder item 3: GST status is being checked with a CA. If the answer changes, this line changes)*
6. What is Ink? → `Ink is Lawie's credit unit. Most documents use 2 Ink; short ones, such as most notices and affidavits, use 1. You're charged only after a draft is generated; a failed generation is not charged. The Free plan gives you 5 Ink (lifetime). Solo and Pro plans refill Ink every month. You can also buy top-up packs anytime.` **(Signed)**

When T-227 AC3 ships (cost shown before generating) and Priya confirms it, Meera can add "You see the cost before you generate." Ajay checks it then. Not before.

## Grep for Ink: other public lines that contradict T-227 or the signed rules

`grep -rn -E "[0-9] Ink|Ink credit|lifetime|per document|court formatting|BNS validation" apps/web/src` (12 Oct 2026, `develop_staging` working tree, read only):

| File:line | Current (exact) | Problem | Proposed |
| --- | --- | --- | --- |
| `app/(marketing)/faq/page.tsx:48` | `Lawie has a free tier that includes 5 Ink (lifetime). Solo is ₹799/month (50 Ink/month). Pro is ₹1,999/month (150 Ink/month).` | Pro price in other copy (Vikram: Pro goes in no other copy); no Ink-per-document rule | `Lawie has a free tier with 5 Ink on sign-up (lifetime). Solo is ₹799/month with 50 Ink a month. Top-up packs start at ₹65 for 3 Ink. Most documents use 2 Ink; short ones, such as most notices and affidavits, use 1. See the pricing page for all plans.` |
| `app/(marketing)/faq/page.tsx:53` | `Five Ink lifetime for free users. All templates, court formatting, BNS validation, PDF/DOCX export. Free exports carry a Lawie watermark.` | "court formatting", "BNS validation" (banned) | `5 Ink on sign-up (lifetime). All document types, PDF and DOCX export. Criminal drafts cite BNS, BNSS and BSA.  |
| `app/(marketing)/page.tsx:104–106` | `'5 Ink, lifetime'` · `'₹799' … '50 Ink a month'` · `'₹1,999' … '150 Ink a month'` | Pro price on the home page | Replace the three plan cards with the Ink teaser in `copy/landing.md` (no rupees) |
| `app/(marketing)/page.tsx:208` | `Free tier: 5 Ink (lifetime) · No credit card required` | "No credit card required" is not a signed claim | `5 free Ink on sign-up · Sign in with Google` (landing.md) |
| `app/(marketing)/page.tsx:300` | `Drafts are paid for with Ink credits.` | Not false, but no rule | Ajay's Ink line (landing.md pricing teaser) |
| `app/(marketing)/page.tsx:341` | `Free for your first 5 Ink. No card required.` | Unsigned "no card"; the heading above it is a time claim ("Start drafting in the next five minutes.") | `5 free Ink on sign-up. Sign in with Google.` (landing.md final CTA) |
| `app/(marketing)/about/page.tsx:129` | `Free for your first 5 Ink. No card required.` | Unsigned "no card" | `5 free Ink on sign-up. Sign in with Google.` |
| `app/(marketing)/pricing/layout.tsx:6` (metadata) | `Simple, transparent pricing. Free tier with 5 Ink lifetime, or Solo at ₹799/month for 50 Ink/month.` | OK on prices; no rule | `Start with 5 free Ink. Most documents use 2 Ink, short ones 1. Solo is ₹799/month for 50 Ink. Top-ups from ₹65.` (≈115 chars) |
| `components/marketing/SiteFooter.tsx:29` | `Start Drafting` | Not about Ink; fine. Optional: `Start with 5 free Ink` | Optional |
| `components/marketing/SiteFooter.tsx:70` | `AI-assisted drafting tool — not a substitute for legal advice.` | Not the signed disclaimer | `Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.` |
| `app/(marketing)/tools/page.tsx` | No Ink or price line | — | No change |

Found while grepping, outside the public pages (for Priya, not part of T-238):
- `components/credits/PaywallModal.tsx:123` `50 Ink / mo · ₹799`: true (Solo final).
- `components/credits/UpgradeSuccessModal.tsx:20` `150 Ink / month — reset each billing cycle` (Pro): true today, but Pro is under review.
- `components/credits/TopUpModal.tsx:13,229` uses a `POPULAR` badge in-app. If the public badge goes for lack of data, the in-app one should go too.
- `components/landing/PainSolution.tsx:7` `Lawie generates it in 5 minutes — with correct BNS sections and court formatting.`: three banned claims. Not imported anywhere (dead file, like the three T-141a deleted). Recommend deleting it in the new ticket.
- `app/(marketing)/faq/page.tsx:40` `Hindi drafting is on the roadmap and rolling out template by template.`: implies some Hindi templates are live. Proposed: `Drafts are in English today. Hindi drafting: coming soon.`
- `app/(marketing)/about/page.tsx` still says "Formats the cause title, prayer, verification, and advocate block for your selected court", "Maps IPC, CrPC, and IEA references to their current BNS, BNSS, and BSA equivalents" and "first draft in minutes". These are T-141a's scope (court/time claims) plus Ajay's new old-law ruling. Flag to Priya: check T-141a's signed table covers them; if not, add them to the new ticket.

## Watermark lines for T-252 (grep `watermark` in `apps/web/src`, read only, 12 Oct 2026)

Priya: there is no watermark on any plan (policy, locked by a test). Every line below is false today.

| # | File:line | Current (exact) | Replacement |
| --- | --- | --- | --- |
| W1 | `app/(marketing)/pricing/page.tsx:130` | `Lawie watermark on exports` | Drop the row (pricing table row 17) |
| W2 | `app/(marketing)/pricing/page.tsx:157` | `No watermark on exports` | Drop the row (row 18) |
| W3 | `app/(marketing)/pricing/page.tsx:184` | `No watermark on exports` | Drop the row (row 19) |
| W4 | `app/(marketing)/faq/page.tsx:53` | `Five Ink lifetime for free users. All templates, court formatting, BNS validation, PDF/DOCX export. Free exports carry a Lawie watermark.` | `5 Ink on sign-up (lifetime). All document types, PDF and DOCX export. Criminal drafts cite BNS, BNSS and BSA.` |
| W5 | `app/dashboard/documents/[id]/page.tsx:406–420` (document page, free users) | Comment `Watermark notice for free tier` and the notice `Free tier exports include a watermark. [Upgrade to Pro] for clean exports.` | Remove the whole notice block (`{isFree && (...)}`). Nothing true is left to say, and its "Upgrade to Pro" button pushes a plan that is under review (Vikram). Ajay to confirm no replacement line is wanted |

Not claimed anywhere: the disclaimer banner and the export footers cannot be removed (Priya), so no copy may say or imply they can. "Edit every line of the draft" is allowed.

## Offers on these pages

Pricing and landing copy mention no referral or demo code. If either ever does (+5 Ink bar-demo code, +3 Ink ambassador code), it must say "new accounts only": codes apply on Google sign-in for new accounts only, and an invalid code is silently ignored (Priya). Ajay checks any such line.

## Claims to check (Ajay)

| # | Claim | Row |
| --- | --- | --- |
| 1 | FAQ "What is Ink?" answer | 1 (signed) |
| 2 | "Most documents use 2 Ink, short ones 1. Buy extra packs anytime." | 2 (signed) |
| 3 | "Edit every draft before you download" | 5 (the clean Free list now says "Edit every line of the draft", which Priya allows) |
| 4 | "Criminal drafts cite BNS, BNSS and BSA" in the Free plan list | 6 (signed wording) |
| 5 | "Start with 5 free Ink. Buy more when you need it." | 7 |
| 6 | "5 Ink on sign-up" in place of "5 Ink — forever" | 8 |
| 7 | "All document types (more than 90)" | 9 |
| 8 | Top-ups "available on all plans", including Free | 13 |
| 9 | "BEST VALUE" (true among top-ups per Ink) | 14 |
| 10 | Proposed FAQ page lines (faq:48, faq:53, faq:40), pricing metadata, footer disclaimer | Grep table |
