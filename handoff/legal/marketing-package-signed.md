# Meera's marketing package: claims check (signed)

Ajay (CLO), 12 Oct 2026 IST. Read: `handoff/marketing/` at the commit after 9db27b2: `calendar-week1.md`, `calendar-week2.md`, `reels.md`, `copy/pricing.md`, `copy/landing.md`, and every "Claims to check" list in them. Builds on `marketing-s1-claims-signed.md` (a4ae2c3). I checked the facts I can check from the repo (rule files, T-227 price list, web code); what needs a live product or a person is marked.

Nothing is public before T-403. Every post is also gated on the product matching the claim on the day it goes out.

## A. Gates (apply to everything below)

| Gate | Applies to |
|---|---|
| T-227 merged | Every Ink line, every "bail = 2 Ink", every "notice = 1 Ink" |
| T-238 and T-252 merged | Any rupee figure (Solo ₹799, top-ups from ₹65), after the founder checks the Razorpay plans |
| T-251 merged (default bail text) | Any post naming default bail; the current pack has a live legal error |
| T-245a/b merged | Any criminal-draft screenshot, reel or sample PDF. Until then the packs cite BNS for old-law cases |
| T-194 merged | Nothing may mention highlighted blanks until it is live; once it is, "blanks are highlighted in exports" needs my line |
| T-234 on production | Swap "Email and password: coming soon" for the email sign-in line |

## B. Pricing page (`copy/pricing.md`)

| Row | Mark | Exact change |
|---|---|---|
| 1, 2 | Approved | Signed already |
| 3, 4 | Approved | Badges removed ("most popular" has no data) |
| 5 "Edit every draft before you download" | Approved | |
| 6 "Criminal drafts cite BNS, BNSS and BSA" | Approved | |
| 7 hero subline | Approved | |
| 8 "5 Ink on sign-up" | Approved | |
| 9 "All document types (more than 90)" | Approved | True: 92 rule files, all on Free (T-222) |
| 10 Free button "Start with 5 free Ink" | Approved | |
| 11 Solo button | Acceptable with change | Never "free" on the Solo card. "Choose Solo" if the button goes to the Solo upgrade or checkout; if it goes to sign-up, "Sign up to choose Solo" |
| 13 "Available on all plans" (top-ups) | Condition | Priya confirms in writing that a Free-plan account can buy a top-up pack. If not, "Available to every account" is not allowed either; drop the sentence |
| 14 "BEST VALUE" on ₹499 | Not approved | Drop the badge. ₹499 for 28 Ink is the lowest price per Ink among the three packs (about ₹17.8), but Solo is ₹799 for 50 Ink (about ₹16.0 per Ink), so "best value" and "lowest price per Ink" are both false if read across the page. Allowed if it fits: "LOWEST PRICE PER INK OF THE 3 PACKS" |
| 15 "Priority email support" | Not approved | Drop it, unless Priya confirms a real priority route (a named inbox or queue and the response time we keep). A benefit that is only a label induces payment on a false basis (Consumer Protection Act, 2019, misleading advertisement) |
| 16 "Early access to new templates" | Not approved | Drop it until an early-access mechanism exists. Add it back with my line when it does |
| 17 "Lawie watermark on exports" / "No watermark on exports" | Blocker | I found no watermark in the export code (`pdf-export.service.ts`, `exportUtils.ts`); only the notice "Free tier exports include a watermark." on `dashboard/documents/[id]/page.tsx:411`. If no watermark is applied, both pricing lines and that in-app notice are false, and "No watermark" is a false reason to pay. Remove all three (and the FAQ line at `faq/page.tsx:53`) until a watermark exists. Priya to confirm either way and tell me; if one exists, I sign a line |
| Pro price | Approved | Stays only on the pricing page, as Vikram says |
| Variants A, B, C for the Why Ink panel | Approved | A is the default. C ("A failed generation is not charged.") is also fine |
| Future "You see the cost before you generate" | Condition | Only after T-227 AC3 is built and I have seen it |

### Other public lines (grep table)

| Line | Mark |
|---|---|
| `faq/page.tsx:48` proposed text | Approved |
| `faq/page.tsx:53` | Approved with change: drop the watermark sentence (row 17) |
| `faq/page.tsx:40` "Drafts are in English today. Hindi drafting: coming soon." | Approved |
| `page.tsx:104-106`, `208`, `300`, `341`; `about/page.tsx:129` | Approved as proposed. "No card required" returns only if Priya confirms that Free sign-up never asks for payment details |
| `pricing/layout.tsx` metadata | Approved |
| `SiteFooter.tsx:29`, `:70` | Approved |
| `about/page.tsx`: "Formats the cause title ... for your selected court", "Maps IPC, CrPC, and IEA references to their current BNS, BNSS, and BSA equivalents", "first draft in minutes" | Blocker, in T-252. The first is a court claim (banned), the second says Lawie converts sections (it does not, and must not), the third is a time claim |
| `PainSolution.tsx` (dead file with three banned claims) | Delete it |
| `TopUpModal.tsx` in-app "POPULAR" badge | Remove, same reason as rows 3 and 4 |
| `UpgradeSuccessModal.tsx` "Priority support" | Remove with row 15 |

## C. Landing page (`copy/landing.md`)

| Item | Mark |
|---|---|
| Meta, title A, description | Approved |
| Hero: eyebrow, headlines A, B, C, subline, CTAs, note | Approved |
| How it works (3 steps) | Approved. Item 13: Priya confirms the form asks about parties, dates and the facts the document needs |
| Document families table (claim 4) | Approved: every example matches a rule file (checked by name) |
| "Find yours in the document list after you sign in." | Approved |
| Sample PDFs | Held. I have not seen the four PDFs. They stay off until I check each against the disclaimer and the old-law gate; send me the paths |
| You stay the advocate (body and three points) | Approved. "Every line of the draft is yours to change" is Approved if Priya confirms the editor lets the user change the prayer and verification text; otherwise use "Everything in the draft can be changed in the editor." |
| Pricing teaser | Approved (signed Ink line) |
| Sign-in note | Approved |
| FAQ 1 to 8 | Approved. FAQ 3 "Lawie does not give legal advice and does not file anything" is a denial: Approved |
| Removed FAQ "Is my case data secure?" | Stays removed. No "secure", "safe" or "encrypted" claim anywhere until I sign one: the privacy policy (T-235) says form answers and the fact list are not encrypted |
| Final CTA, footer disclaimer | Approved |
| Hindi hero and how-it-works | Approved. The English line under it ("Drafts are in English. Hindi drafting: coming soon.") is required |

## D. Calendar posts (weeks 1 and 2)

| Item | Mark |
|---|---|
| "Lawie is live" (all W1-Day 1 posts) | Approved from T-403 |
| "Over 90 / more than 90 document types" and the family lists (W1-IG-3, W1-X-2, W1-LI-2) | Approved |
| "Six bail types are live" (W1-IG-3, W2-LI-1, W2-X-1, W2-IG-1) | Approved. Default bail only after T-251 |
| "Criminal drafts cite BNS, BNSS and BSA" (all) | Approved, exact |
| Ink line, English, and the Hindi renderings (W1-LI-1, W1-X-3, W1-WA-2, W2-LI-3) | Approved: the Hindi says the same as the English, including that Ink is charged only after a draft is generated and a failed generation is not |
| W1-X-3 "Most documents, incl. bail and petitions: 2 Ink" and its Hindi | Change to "Most documents, such as bail applications and plaints: 2 Ink" and "ज़्यादातर डॉक्यूमेंट, जैसे bail application और plaint: 2 Ink". A mutual-consent divorce petition is 1 Ink (T-227 list), so "petitions" is not true across the board |
| "A bail application uses 2 Ink" (W2-WA-1, W2-LI-3, W2-X-3) | Approved. None of the six bail types is on the 1-Ink list |
| "A legal notice or affidavit is usually 1 Ink" (W2-LI-3, W2-WA-2) | Approved: all 8 legal-notice rule files and the affidavit files are on the 1-Ink list |
| W2-WA-2 half of the Ink sentence ("charged only after a draft is generated") | Acceptable; the full sentence is better |
| "Solo ₹799/month, 50 Ink" and "Top-ups from ₹65 (3 Ink)" | Approved after the gates in section A |
| W2-LI-1 "the documents a district-court junior drafts most" | Use the softer form: "one of the documents a district-court junior drafts most often". It is not a measured figure |
| W2-LI-2, W2-IG-3, W2-X-2 review checklist | Approved. It is a review aid for the advocate's own draft, addressed to advocates, and does not solicit anyone, so "your client" is not a problem: BCI Rules, Part VI, Chapter II, r.36 bars advocates from soliciting work and advertising, not a tool speaking to advocates about their own matter. Add one sentence to the LinkedIn post and the carousel caption: "This list is a start, not a complete one." Bail packs do output the court heading and cause title, prayer and verification; the advocate block is added by the system. Priya confirms on production output (claim 3) |
| W1-LI-3 "the filing, and the judgement, stay with you" | Approved |
| W1-WA-1, W1-WA-2, W2-WA-1, W2-WA-2 broadcasts to an opt-in list | Condition: each contact opted in to these messages, with the purpose stated, and the opt-in is recorded (DPDP Act, 2023, s.6); "Reply STOP" works and is honoured |

## E. Reels (`reels.md`)

| Frame | Mark |
|---|---|
| R1 0:18 to 0:25, section on screen | Condition. Court is "[Sample Sessions Court]", so the heading and prayer must show Section 483 BNSS (Section 480 only before a Magistrate). I check the actual frame before publishing |
| R1 other claims 1 to 6 | Approved. Priya confirms the intake fields named in the voice-over |
| R2 hook "A legal notice. 1 Ink." and "Most notices use 1 Ink. Charged only after a draft is generated." | Approved after T-227 |
| R2 0:17 to 0:23 Ink pill overlay | Priya confirms the pill shows on production, else cut the overlay and keep the line |
| R2 notice frame | Condition. The demand paragraph must call for payment within fifteen days of receipt of the notice, as NI Act s.138 proviso (c) requires; I check the actual frame. "Cheque bounce complaint" stays banned; this is a notice |
| R3 | Approved. Priya confirms where the disclaimer line shows |
| All reels: fictional matter labelled, offence date after 1 July 2024, no time claim, end-card disclaimer | Approved |

## F. Offers (`W1-BD-WA`, `AMB-WA`)

| Item | Mark |
|---|---|
| "+5 Ink" (bar-demo code) and "+3 Ink" (ambassador code), "on top of the 5 free Ink", new accounts only | Approved wording. Never "free drafts" |
| The cap on uses | Must be stated. A limit on quantity is a condition of the offer; hiding it misleads the person who is refused the 51st (or 101st) place. Bar-demo: add "for the first 50 sign-ups" / "पहले 50 साइन-अप के लिए". Ambassador: add "for the first 100 sign-ups" / "पहले 100 साइन-अप के लिए" |
| Expiry | Bar-demo: "works until {EXPIRY_DATE}" is right. Ambassador: add "valid for 60 days from {START_DATE}" / "{START_DATE} से 60 दिन के लिए" |
| Ambassador is paid a flat stipend | Disclosure required: the message begins "I'm a Lawie campus ambassador." / "मैं Lawie का campus ambassador हूँ।" (paid endorsement; Guidelines for Prevention of Misleading Advertisements and Endorsements for Misleading Advertisements, 2022, and the Department of Consumer Affairs endorsement guidance; clause numbers: verify). "I use Lawie" must be true for each ambassador |
| Who may be an ambassador | Law students who are not enrolled advocates. A paid enrolled advocate promoting a product to other advocates comes to me first (BCI Rules, Part VI, Chapter II, r.36) |
| Where the code is entered (T-234 referral box) and Google sign-in applies it | Priya confirms with a lead before any message goes out |

## G. Conditions that did not fit above

| Item | Mark |
|---|---|
| Hindi Ink renderings elsewhere in the calendar | Approved if they repeat the signed meaning. Any new Hindi rendering of a price or legal claim comes to me |
| New claims not in the lists above | Come to me before use |

## H. The four sample PDFs on the home page (added 12 Oct 2026 IST)

Read: `apps/drafting/scripts/seed-sample-pdfs.ts` (inputs only) and `apps/web/src/app/(marketing)/page.tsx:70-96` (links to `/api/samples/bail-application`, `legal-notice-s138`, `rent-agreement`, `consumer-complaint`). The PDFs themselves are generated once by the AI and stored in MongoDB; I have not seen the stored text, so I cannot sign them.

| Item | Mark |
|---|---|
| Bail sample law | The inputs are an FIR of March 2025 under BNS 115(2), so BNS/BNSS is the right law whatever T-245 does. Not a wrong-law sample |
| Stored text may predate T-136 and T-148 (no case law, no invented facts, no "first application") | Unknown. The home page links all four today. Priya/Arjun: is the home page public now, or only on the founder's environment? If public, take the four "Sample PDF" links off the page now (a copy-only change in T-252) until I have read and signed regenerated ones |
| Inputs look like real people and places: "Adv. Ravi Shankar Singh", enrolment "J/845/2012", a Patna chamber address, FIR "42/2025", Kotwali | Not allowed in a public sample. A real advocate or enrolment number could match a real person. Regenerate with obviously sample values (as the reels: "A. Kumar (sample)", FIR 000/2026, "Sample Nagar") and a visible "Sample, fictional matter" on every page |
| Consumer complaint input says the complaint "is within the limitation prescribed under Section 69" | Not allowed. "Within limitation" is banned; regenerate with the limitation sentence as the form's date only |
| Regeneration | After T-241, T-245a/b, T-251 and the T-136 rules are on production (the seed script runs the real Drafter). A lead runs `seed:sample-pdfs` against a non-production database first, exports the four PDFs to text for me, and I sign each. Rent agreement and consumer complaint do not wait for the criminal gates |
| Until then | No marketing use of any sample (reel, post, one-pager) |

Signed: Ajay (CLO), 12 Oct 2026 IST. Rows marked Approved, Acceptable with change (with the change made) and Condition (once met). Rows marked Not approved or Blocker are not signed.
