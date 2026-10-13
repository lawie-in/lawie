# Pricing page copy — lawie.in/pricing (T-238 and follow-on)

Owner: Madhuri (copy). Signed lines: Meera (T-238 line), Ajay (`handoff/legal/marketing-s1-claims-signed.md`), Vikram (`handoff/tickets/vikram-gtm-decisions.md`). Build: a lead, through Priya.
File: `apps/web/src/app/(marketing)/pricing/page.tsx` (read only. Nothing here has been edited).
Status: **DRAFT for Priya.** Rows marked "Signed" use wording already signed; every other row needs Ajay's check before build.

## Note for the dev lead (through Priya)

- **Copy only.** String literals and JSX text in `pricing/page.tsx`, plus removing the two badge elements. No logic, no style, no price-calculation changes.
- **T-238** covers rows 1–6 below (Meera, 12 Oct: the badges and the Free-plan lines are part of T-238). T-238 AC2 says "the lead changes only that copy", so Priya should widen T-238's AC2 to rows 1–6, or open a sibling ticket for rows 3–6.
- **T-252** (Priya) covers rows 7–14 and for the other public lines in "Grep for Ink" below (home, FAQ, about, pricing metadata).
- **Depends on T-227.** The Ink line is true only once T-227 is merged (shown price = charged price). Ship T-238 after or with T-227.
- Rows 15–19 are plan benefits. Priya (12 Oct): no plan has a watermark (policy, locked by a test), so rows 17–19 are false and must go. Rows 15–16 are dropped (Ajay: not approved; Priya: priority support does not exist, and there is no early-access mechanism).
- After the change, T-238 AC3: `grep -rn "Ink" apps/web/src/app/(marketing)` shows no line that contradicts T-227 (see the grep list below).

## Before → After (`pricing/page.tsx`)

Status 12 Oct: rows 1–6 are already built on the page (commit 41a41ff, T-238; the Most Popular, POPULAR and BEST VALUE badges are gone). Rows 7–14 below are checked against the page as it is now, line numbers included. The "Current (exact)" column is quoted from `apps/web/src/app/(marketing)/pricing/page.tsx` as read on 12 Oct (read only). Rows 1–6 keep their original line numbers and the pre-T-238 text; they are history.

| # | Line | Current (exact) | New | Status |
| --- | --- | --- | --- | --- |
| 1 | 42, FAQ "What is Ink?" answer | `Ink is Lawie's credit unit. Each document you generate uses 1 Ink. The Free plan gives you 5 Ink (lifetime). Solo and Pro plans refill Ink every month. You can also buy top-up packs anytime.` | `Ink is Lawie's credit unit. Most documents use 2 Ink; short documents, such as most notices and affidavits, use 1. You're charged only after a draft is generated; a failed generation is not charged. The Free plan gives you 5 Ink (lifetime). Solo and Pro plans refill Ink every month. You can also buy top-up packs anytime.` | **Signed** (Ajay + Meera, T-238). Replaces Meera's earlier "…when a draft is ready" version |
| 2 | 202, "Why Ink?" panel | `Less than ₹16 per document on Solo. Buy extra packs anytime.` | `Most documents use 2 Ink, short documents 1. Buy extra packs anytime.` | **Signed** (Ajay + Vikram) |
| 3 | 143, Solo card badge | `Most Popular` | *(remove the badge element)* | Meera, T-238. No usage data supports "most popular" |
| 4 | 224, top-up badge on ₹199 | `POPULAR` | *(remove the badge element)* | Meera, T-238. Same reason |
| 5 | 121, Free plan list | `Court formatting` | `Every line of the draft is yours to change` | New, Ajay to check. No court-format claim (T-140 not started; "formatted to your court" banned) |
| 6 | 124, Free plan list | `BNS validation` | `Criminal drafts use BNS, BNSS and BSA section numbers` | Ajay's signed line. "Validation" is banned |
| 7 | 99, hero subline | `Ink credits — start free, buy more when you need it.` | `Start with 5 free Ink once your email is verified. Buy more when you need it.` | **Signed by Ajay** (T-398 file, 13 Oct). The condition must stand next to the offer. The Free button `Start with 5 free Ink` stays |
| 8 | 115, Free plan sub-price line | `5 Ink — forever` | `5 Ink on sign-up, once your email is verified (lifetime)` | **Signed by Ajay** (T-398 file). Replaces "No card required". 375 px alternates, in order: `5 Ink once your email is verified (lifetime)` · `5 Ink, once your email is verified` |
| 9 | 118, Free plan list | `All templates` | `Every document type on Lawie` | **Signed by Ajay** (T-398 file). Replaces "All document types (more than 90)"; the "more than 90" count must be re-counted before reuse |
| 10 | 134, Free plan button | `Start Free` | `Start with 5 free Ink` | Ajay rule: "free" next to "5 Ink" |
| 11 | 161, Solo plan button | `Start Drafting Free` | `Sign up to choose Solo` | Ajay: never "free" on the Solo card. The button now goes to `/login` (sign-up), so the label is "Sign up to choose Solo". If it is wired to the Solo upgrade or checkout, use `Choose Solo` |
| 12 | 113, Free plan price suffix | `₹0<small>/lifetime</small>` | `₹0` (drop `/lifetime`) | **Signed by Ajay** (T-398 file). The Ink line already says lifetime |
| 13 | 209, top-up section sub | `Buy one-time packs — no subscription required. Available on all plans.` | *(no change)* | Condition met: Priya confirmed from the code (12 Oct) that a Free account can buy a top-up pack. "Available on all plans" stays. |
| 14 | (no line: the ₹499 top-up card on the pricing page now has no badge) | `BEST VALUE` (was on the ₹499 card; gone in 41a41ff) | *(no badge. Nothing to add.)* Optional only: `LOWEST PRICE PER INK OF THE 3 PACKS` | **"BEST VALUE" not approved (Ajay).** Solo is ₹799 for 50 Ink (about ₹16.0 per Ink) against ₹499 for 28 Ink (about ₹17.8), so "best value" and "lowest price per Ink" are false if read across the page. The long label is allowed only if it fits the badge; otherwise drop the badge |
| 15 | 154, 181, Solo and Pro lists | `Priority email support` | *(drop the row)* | **Not approved (Ajay).** Priya: priority support does not exist, so the row is gone. A label with nothing behind it is a misleading advertisement (CPA 2019). Same for in-app `UpgradeSuccessModal.tsx:23` `Priority support` (row 20) |
| 16 | 157, 184, Solo and Pro lists | `Early access to new templates` | *(drop the row)* | **Not approved (Ajay).** Drop until an early-access mechanism exists; add back with Ajay's line when it does |
| 17 | 130, Free plan list | `Lawie watermark on exports` | *(drop the row)* | Priya: there is NO watermark on any plan (policy, locked by a test). Never claim one. The Free list already has `PDF / DOCX export` (clean copy: "Download in Word or PDF"), so nothing replaces it |
| 18 | 151, Solo plan list | `No watermark on exports` | *(drop the row)* | Same. Not a paid benefit. Nothing true is left to say here, so the row goes |
| 19 | 178, Pro plan list | `No watermark on exports` | *(drop the row)* | Same |
| 20 | `components/credits/UpgradeSuccessModal.tsx:23` (in-app, Pro) | `Priority support` | *(drop the row)* | Ajay (section B): remove with row 15 |
| 21 | `components/credits/TopUpModal.tsx:13,229` (in-app) | `POPULAR` badge | *(remove the badge)* | Ajay (section B): same reason as rows 3 and 4 (no data) |

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
- Subline: Start with 5 free Ink once your email is verified. Buy more when you need it. (77) (signed)

**Toggle:** Monthly / Yearly (unchanged)

**Free**
- Name: Free
- Price: ₹0 (signed)
- Line: 5 Ink on sign-up, once your email is verified (lifetime) (signed)
- List: Every document type on Lawie (signed) · Every line of the draft is yours to change · Criminal drafts use BNS, BNSS and BSA section numbers · Download in Word or PDF
- Button: Start with 5 free Ink

**Solo** *(no badge)*
- Name: Solo
- Price: ₹799 /month · or ₹7,990/year — save 2 months. Yearly view: ₹7,990 /year · ₹1,598 saved vs paying monthly
- List: 50 Ink/month · Everything in Free *("plus" dropped: nothing verified is left to add. priority support does not exist and there is no early-access mechanism, rows 15–16)*
- Button: Sign up to choose Solo *(or "Choose Solo" if it goes to the Solo upgrade or checkout, row 11; never "free")*

**Pro** *(page text unchanged; [under review, Vikram])*
- Name: Pro
- Price: ₹1,999 /month · or ₹19,990/year — save 2 months. Yearly view: ₹19,990 /year · ₹3,998 saved vs paying monthly
- List: 150 Ink/month · Everything in Solo *(the current list repeats Solo's items; same unverified benefits, rows 15–16)*
- Button: Get Pro

**Why Ink? panel**
- Heading: Why Ink?
- Line: Most documents use 2 Ink, short documents 1. Buy extra packs anytime. (64)

Variants for the panel line, if Meera wants one more Ink fact there (each needs Ajay; the signed line above is the default):
- A (signed): "Most documents use 2 Ink, short documents 1. Buy extra packs anytime." (64)
- B: "Pay per draft: most documents use 2 Ink, short documents 1. Buy extra packs anytime." (79)
- C: "Most documents use 2 Ink, short documents 1. A failed generation is not charged." (75)

**Top-up packs**
- Eyebrow: Top-up packs
- Heading: Need a few extra Ink?
- Sub: Buy one-time packs — no subscription required. Available on all plans.
- Cards: ₹65 · 3 Ink — ₹199 · 10 Ink — ₹499 · 28 Ink *(POPULAR removed; BEST VALUE dropped or replaced by "LOWEST PRICE PER INK OF THE 3 PACKS", row 14)*

**Pricing FAQ** *("Billing questions, answered.")*
1. Can I cancel anytime? *(unchanged)*
2. Do you offer refunds? *(unchanged)*
3. What payment methods do you accept? *(unchanged)*
4. Do you have a team plan? *(unchanged)*
5. Is GST included? *(unchanged. Vikram's founder item 3: GST status is being checked with a CA. If the answer changes, this line changes)*
6. What is Ink? → `Ink is Lawie's credit unit. Most documents use 2 Ink; short documents, such as most notices and affidavits, use 1. You're charged only after a draft is generated; a failed generation is not charged. The Free plan gives you 5 Ink (lifetime). Solo and Pro plans refill Ink every month. You can also buy top-up packs anytime.` **(Signed)**

When T-227 AC3 ships (cost shown before generating) and Priya confirms it, Meera can add "You see the cost before you generate." Ajay checks it then. Not before.

## Grep for Ink: other public lines that contradict T-227 or the signed rules

`grep -rn -E "[0-9] Ink|Ink credit|lifetime|per document|court formatting|BNS validation" apps/web/src` (12 Oct 2026, `develop_staging` working tree, read only):

| File:line | Current (exact) | Problem | Proposed |
| --- | --- | --- | --- |
| `app/(marketing)/faq/page.tsx:48` | `Lawie has a free tier that includes 5 Ink (lifetime). Solo is ₹799/month (50 Ink/month). Pro is ₹1,999/month (150 Ink/month).` | Pro price in other copy (Vikram: Pro goes in no other copy); no Ink-per-document rule | `Lawie has a free tier with 5 Ink on sign-up (lifetime). Solo is ₹799/month with 50 Ink a month. Top-up packs start at ₹65 for 3 Ink. Most documents use 2 Ink; short documents, such as most notices and affidavits, use 1. See the pricing page for all plans.` |
| `app/(marketing)/faq/page.tsx:53` | `Five Ink lifetime for free users. All templates, court formatting, BNS validation, PDF/DOCX export. Free exports carry a Lawie watermark.` | "court formatting", "BNS validation" (banned) | `5 Ink on sign-up (lifetime). All document types, PDF and DOCX export. Criminal drafts use BNS, BNSS and BSA section numbers.` |
| `app/(marketing)/page.tsx:104–106` | `'5 Ink, lifetime'` · `'₹799' … '50 Ink a month'` · `'₹1,999' … '150 Ink a month'` | Pro price on the home page | Replace the three plan cards with the Ink teaser in `copy/landing.md` (no rupees) |
| `app/(marketing)/page.tsx:208` | `Free tier: 5 Ink (lifetime) · No credit card required` | Claim is true: Free sign-up never asks for payment details (Priya, 12 Oct; Ajay's table returns it on that confirmation). Line stays, shortened | `5 free Ink on sign-up · No card required` (landing.md) |
| `app/(marketing)/page.tsx:300` | `Drafts are paid for with Ink credits.` | Not false, but no rule | Ajay's Ink line (landing.md pricing teaser) |
| `app/(marketing)/page.tsx:341` | `Free for your first 5 Ink. No card required.` | The heading above it is a time claim ("Start drafting in the next five minutes."). "No card required" is true (Priya) | Heading: `Your next draft starts here.` Line: `5 free Ink on sign-up. No card required.` |
| `app/(marketing)/about/page.tsx:129` | `Free for your first 5 Ink. No card required.` | True (Priya); only "Free" needs "5 Ink" next to it, which it has | No change, or `5 free Ink on sign-up. No card required.` |
| `app/(marketing)/pricing/layout.tsx:6` (metadata) | `Simple, transparent pricing. Free tier with 5 Ink lifetime, or Solo at ₹799/month for 50 Ink/month.` | OK on prices; no rule | `Start with 5 free Ink. Most documents use 2 Ink, short documents 1. Solo is ₹799/month for 50 Ink. Top-ups from ₹65.` (≈115 chars) |
| `components/marketing/SiteFooter.tsx:29` | `Start Drafting` | Not about Ink; fine. Optional: `Start with 5 free Ink` | Optional |
| `components/marketing/SiteFooter.tsx:70` | `AI-assisted drafting tool — not a substitute for legal advice.` | Not the signed disclaimer | `Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.` |
| `app/(marketing)/tools/page.tsx` | No Ink or price line | — | No change |

Found while grepping, outside the public pages (for Priya, not part of T-238):
- `components/credits/PaywallModal.tsx:123` `50 Ink / mo · ₹799`: true (Solo final).
- `components/credits/UpgradeSuccessModal.tsx:20` `150 Ink / month — reset each billing cycle` (Pro): true today, but Pro is under review.
- `components/credits/TopUpModal.tsx:13,229` uses a `POPULAR` badge in-app. If the public badge goes for lack of data, the in-app one should go too.
- `components/landing/PainSolution.tsx:7` `Lawie generates it in 5 minutes — with correct BNS sections and court formatting.`: three banned claims. Not imported anywhere (dead file, like the three T-141a deleted). Recommend deleting it in the new ticket.
- `app/(marketing)/faq/page.tsx:40` `Hindi drafting is on the roadmap and rolling out template by template.`: implies some Hindi templates are live. Proposed: `Drafts are in English today. Hindi drafting: coming soon.`
- `app/(marketing)/about/page.tsx`: see the blockers table below (T-252).

## Watermark lines for T-252 (grep `watermark` in `apps/web/src`, read only, 12 Oct 2026)

Priya: there is no watermark on any plan (policy, locked by a test). Every line below is false today.

| # | File:line | Current (exact) | Replacement |
| --- | --- | --- | --- |
| W1 | `app/(marketing)/pricing/page.tsx:130` | `Lawie watermark on exports` | Drop the row (pricing table row 17) |
| W2 | `app/(marketing)/pricing/page.tsx:151` | `No watermark on exports` | Drop the row (row 18) |
| W3 | `app/(marketing)/pricing/page.tsx:178` | `No watermark on exports` | Drop the row (row 19) |
| W4 | `app/(marketing)/faq/page.tsx:53` | `Five Ink lifetime for free users. All templates, court formatting, BNS validation, PDF/DOCX export. Free exports carry a Lawie watermark.` | `5 Ink on sign-up (lifetime). All document types, PDF and DOCX export. Criminal drafts use BNS, BNSS and BSA section numbers.` |
| W5 | `app/dashboard/documents/[id]/page.tsx:561–576` (document page, free users) | Comment `Watermark notice for free tier` and the notice `Free tier exports include a watermark. [Upgrade to Pro] for clean exports.` | Remove the whole notice block (`{isFree && (...)}`). Nothing true is left to say, and its "Upgrade to Pro" button pushes a plan that is under review (Vikram). Ajay to confirm no replacement line is wanted |

Not claimed anywhere: the disclaimer banner and the export footers sit outside the editor and cannot be removed (Priya), so no copy may say or imply they can. "Every line of the draft is yours to change" is allowed (Priya confirmed the prayer and verification are editable; Ajay's approved wording).

## `about/page.tsx` blockers for T-252 (Ajay, section B: Blocker)

Lines read 12 Oct 2026, `develop_staging` working tree. Each replacement makes no court, mapping or time claim.

| # | File:line | Current (exact) | Problem | Replacement |
| --- | --- | --- | --- | --- |
| A1 | `about/page.tsx:82–83` | `Formats the cause title, prayer, verification, and advocate block for your selected court.` | Court claim (banned) | `Lays out the cause title, prayer, verification and advocate block in the draft.` |
| A2 | `about/page.tsx:78–79` | `Maps IPC, CrPC, and IEA references to their current BNS, BNSS, and BSA equivalents.` | Says Lawie converts sections; it does not and must not (old-law offences before 1 July 2024 are not handled) | `Criminal drafts use BNS, BNSS and BSA section numbers.` |
| A3 | `about/page.tsx:118–119` | `…get an advocate from a blank page to a first draft in minutes, on the current law, for the specific court in front of them.` | Time claim; "current law" and "specific court" claims | `…get an advocate from a blank page to a first draft to review, edit and download.` |

Same page, not on Ajay's list but the same kind of claim; Ajay to rule, replacement proposed:

| # | File:line | Current (exact) | Proposed |
| --- | --- | --- | --- |
| A4 | `about/page.tsx:99–100` | `Section mappings are built from the published IPC→BNS, CrPC→BNSS, and IEA→BSA section-wise comparison tables. Check every section before you file.` | `Criminal drafts use BNS, BNSS and BSA section numbers. Check every section before you file.` |
| A5 | `about/page.tsx:103–106` | `The court-formatting rules — how a cause title reads for a District Court versus a High Court, … and we are still adding it court by court.` | Drop the paragraph (court-formatting and coverage claims; T-140 not started) |
| A6 | `about/page.tsx:116–118` | `More states and court levels, more document types, and support for drafting in Hindi alongside English.` | `More document types, and Hindi drafting: coming soon.` |
| A7 | `about/page.tsx:97` | `<h2>Built on the current law</h2>` | `Criminal drafts use BNS, BNSS and BSA section numbers` (the heading would otherwise stand over a paragraph that no longer supports it) |

## Offers on these pages

Pricing and landing copy mention no referral or demo code. If either ever does (+5 Ink bar-demo code, +3 Ink ambassador code), it must say "new accounts only" and tell the user to enter the code in the "Have a referral code?" box on the login page when they sign up. Codes work with Google sign-in for new accounts only, an invalid code is silently ignored, and there is no link support (`?ref=` is T-242), so never write "tap this link for +5 Ink" (Priya). Ajay checks any such line.

## Claims to check (Ajay)

| # | Claim | Row |
| --- | --- | --- |
| 1 | FAQ "What is Ink?" answer | 1 (signed) |
| 2 | "Most documents use 2 Ink, short documents 1. Buy extra packs anytime." | 2 (signed) |
| 3 | "Every line of the draft is yours to change" | 5 (Ajay approved) |
| 4 | "Criminal drafts use BNS, BNSS and BSA section numbers" in the Free plan list | 6 (signed wording) |
| 5 | "Start with 5 free Ink once your email is verified. Buy more when you need it." (signed) | 7 |
| 6 | "5 Ink on sign-up, once your email is verified (lifetime)" in place of "5 Ink — forever" (signed) | 8 |
| 7 | "Every document type on Lawie" (signed) | 9 |
| 8 | Top-ups "available on all plans", including Free (Priya confirmed from the code, 12 Oct) | 13 |
| 9 | No badge on the ₹499 pack ("BEST VALUE" is gone). "LOWEST PRICE PER INK OF THE 3 PACKS" is optional, only if it fits at 375 px and 1280 px | 14 |
| 10 | Proposed FAQ page lines (faq:48, faq:53, faq:40), pricing metadata, footer disclaimer | Grep table |

## Final grep list (T-252)

The full before-and-after table for the FAQ, about page, footer, in-app badges, watermark lines and PainSolution.tsx, and the grep list for "court-ready", "validated", "in minutes", "guaranteed", "AI lawyer", "secure" and "encrypted", is in `copy/site-copy-t252.md` (for Ajay).
