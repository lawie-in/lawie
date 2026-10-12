# T-252: public site copy, before and after (for Ajay)

Owner: Madhuri (copy), Meera signs, Ajay checks every line. Build: a lead, through Priya.
Source: `apps/web/src`, read only, 12 Oct 2026 working tree. Every "Current" cell is quoted from the file at the line shown.
Wording is Ajay's T-238 file (`handoff/legal/T-238-pricing-page-lines-signed.md`), which overrides older notes. Ajay's exact disclaimer: "Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing."
Nothing is public before T-403 and Anushka's PASS.

Line numbers: several are not the ones in the T-252 ticket, because T-238 and T-235 have already changed some files. The numbers below are from the files as they are today.

## 1. FAQ page (`app/(marketing)/faq/page.tsx`)

| # | Line | Current (exact) | After | Why |
| --- | --- | --- | --- | --- |
| F1 | 48 (Pro price) | `Lawie has a free tier that includes 5 Ink (lifetime). Solo is ₹799/month (50 Ink/month). Pro is ₹1,999/month (150 Ink/month).` | `Lawie has a free tier with 5 Ink on sign-up (lifetime). Solo is ₹799/month with 50 Ink a month. Top-up packs start at ₹65 for 3 Ink. Most documents use 2 Ink; short documents, such as most notices and affidavits, use 1. See the pricing page for all plans.` | Pro is under review (Vikram) and goes in no other copy. Ajay marked the proposed text Approved (package B) |
| F2 | 53 (free tier) | `Five Ink lifetime for free users. All templates, court formatting, BNS validation, PDF/DOCX export. Free exports carry a Lawie watermark.` | `5 Ink on sign-up (lifetime). All document types, PDF and DOCX export. Criminal drafts use BNS, BNSS and BSA section numbers.` | "Court formatting" and "BNS validation" are banned; no export carries a watermark on any plan. Package B: "Approved with change: drop the watermark sentence" |
| F3 | 40 (Hindi) | `English is fully supported today. Hindi drafting is on the roadmap and rolling out template by template.` | `Drafts are in English today. Hindi drafting: coming soon.` | "Rolling out template by template" implies some Hindi templates are live. Ajay approved the "after" line (package C) |

## 2. About page (`app/(marketing)/about/page.tsx`)

None of the "after" lines makes a court, conversion or time claim.

| # | Line | Current (exact) | After | Why |
| --- | --- | --- | --- | --- |
| A1 | 82-83 | `Formats the cause title, prayer, verification, and advocate block for your selected court.` | `Lays out the cause title, prayer, verification and advocate block in the draft.` | Court claim (Ajay: blocker) |
| A2 | 78-79 | `Maps IPC, CrPC, and IEA references to their current BNS, BNSS, and BSA equivalents.` | `Criminal drafts use BNS, BNSS and BSA section numbers.` | Says Lawie converts sections. It does not (T-245). Ajay: blocker |
| A3 | 117-119 (one paragraph, with A6) | `More states and court levels, more document types, and support for drafting in Hindi alongside English. The goal stays the same: get an advocate from a blank page to a first draft in minutes, on the current law, for the specific court in front of them.` | `More document types, and Hindi drafting: coming soon. The goal stays the same: get an advocate from a blank page to a first draft to review, edit and download.` | "In minutes" is a time claim; "current law" and "specific court" are claims too. "More states and court levels" implies court coverage that is not built. Ajay: blocker for the time and court parts |

Same page, not on Ajay's list but the same kind of claim. Ajay to rule:

| # | Line | Current (exact) | After | Why |
| --- | --- | --- | --- | --- |
| A4 | 99-100 | `Section mappings are built from the published IPC→BNS, CrPC→BNSS, and IEA→BSA section-wise comparison tables. Check every section before you file.` | `Criminal drafts use BNS, BNSS and BSA section numbers. Check every section before you file.` | Mapping and "built from" claims; the mapping tables are not yet checked (T-267) |
| A5 | 103-106 | `The court-formatting rules — how a cause title reads for a District Court versus a High Court, which clauses are mandatory, where the verification sits — are encoded per state and court level. It is detailed, unglamorous work, and we are still adding it court by court.` | Delete the paragraph | Court-formatting and coverage claims (T-140 not started) |
| A7 | 97 | `<h2>Built on the current law</h2>` | `Criminal drafts use BNS, BNSS and BSA section numbers` (or delete the heading with A4 and A5) | Otherwise it stands over a paragraph that no longer supports it. It also reads as a whole-product "updated for the new law" claim, which Ajay bars |
| A8 | 84-85 | `Exports a finished document as PDF or DOCX, with a filing checklist.` | `Exports the draft as PDF or DOCX.` (if Priya says there is no filing checklist, or whatever it is, drop the clause) | "Finished document" reads as ready to file; "filing checklist" is not confirmed. Priya to check the product |

## 3. Footer (`components/marketing/SiteFooter.tsx`)

| # | Line | Current (exact) | After | Why |
| --- | --- | --- | --- | --- |
| T1 | 16 (left column, `footer-disclaimer`) | `AI-assisted drafting tool — not a substitute for legal advice.` | `Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.` | Ajay's exact line (package B). The same sentence is at line 70, so change both |
| T2 | 70 (bottom bar) | `AI-assisted drafting tool — not a substitute for legal advice.` | `Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.` | Same. Or drop one of the two, which is Rajesh's call |
| T3 | 13-14 (`footer-tag`) | `Legal drafting for Indian advocates — built around BNS, BNSS, and BSA.` | `Drafting assistant for Indian advocates.` (Ajay to rule; or `Criminal drafts use BNS, BNSS and BSA section numbers.`) | "Built around BNS, BNSS and BSA" is the whole-product new-law claim Ajay bars. Not on his list, found in the same file |

## 4. In-app badges and benefit lines

| # | Where | Current (exact) | After | Why |
| --- | --- | --- | --- | --- |
| M1 | `components/credits/TopUpModal.tsx:13` (type), `:229-235` (render) | `badge?: 'POPULAR' \| 'BEST_VALUE';` and `sku.badge === 'POPULAR' ? 'bg-blue-100 text-blue-700' : 'bg-amber-200 text-amber-900'` and `{sku.badge === 'BEST_VALUE' ? 'Best value' : 'Popular'}` | Remove the badge `<span>`. The POPULAR badge goes for the same reason as the pricing page (no usage data). Ajay to confirm the BEST_VALUE badge goes too: on the public page it is "not approved" (Solo has a lower price per Ink) | Package B: "Remove, same reason as rows 3 and 4" |
| M2 | `components/credits/UpgradeSuccessModal.tsx:23` (Pro list) | `'Priority support',` | Delete the line | No priority route exists (Priya). Package B: "Remove with row 15" |
| M3 | `app/dashboard/settings/page.tsx:140` (found in the grep, not in T-252) | `<li>✓ Priority support</li>` | Delete the line | Same reason as M2 |
| M4 | `app/dashboard/settings/page.tsx:137` and `:139` (found in the grep) | `<li>✓ Unlimited document generations</li>` and `<li>✓ BNS / IPC section auto-fill</li>` | `Unlimited` has no basis (Ink is 50 a month on Solo, 150 on Pro): delete the line. "Auto-fill" is a section-conversion claim: delete it, or `Criminal drafts use BNS, BNSS and BSA section numbers` | Priya to confirm which plan this list belongs to. Ajay to rule |
| M5 | `components/credits/UpgradeSuccessModal.tsx:16` (found in the grep) | `'Unused Ink rolls over (up to 2× cap on yearly)',` | For Priya and Vikram: the signed FAQ says plans "refill Ink every month" and says nothing about rollover. Confirm it is true, or remove | Not in T-252. Only noted |

## 5. Watermark lines (none is true: no export carries a watermark on any plan)

| # | Where | Current (exact) | After | Why |
| --- | --- | --- | --- | --- |
| W1 | `app/(marketing)/pricing/page.tsx:130` | `<Minus strokeWidth={2} /> Lawie watermark on exports` (the whole `<li className="limit">`) | Delete the row | Nothing true is left to say. `PDF / DOCX export` (line 127) stays |
| W2 | `app/(marketing)/pricing/page.tsx:151` (Solo; the ticket says 157) | `<Check strokeWidth={2} /> No watermark on exports` | Delete the row | Not a paid benefit; every plan has it |
| W3 | `app/(marketing)/pricing/page.tsx:178` (Pro; the ticket says 184) | `<Check strokeWidth={2} /> No watermark on exports` | Delete the row | Same |
| W4 | `app/(marketing)/faq/page.tsx:53` | `Free exports carry a Lawie watermark.` (last sentence of F2) | Gone with F2 | F2 |
| W5 | `app/dashboard/documents/[id]/page.tsx:561-576` (the ticket says 407-411) | Comment `{/* Watermark notice for free tier */}` and the notice `Free tier exports include a watermark. [Upgrade to Pro] for clean exports.` | Remove the whole `{isFree && (...)}` block, comment included | Nothing true is left to say. The "Upgrade to Pro" button also pushes a plan that is under review (Vikram). Ajay to confirm no replacement line is wanted |

## 6. Dead file

| # | File | Current | After | Why |
| --- | --- | --- | --- | --- |
| P1 | `components/landing/PainSolution.tsx` | Three banned claims, for example `Lawie generates it in 5 minutes — with correct BNS sections and court formatting.` and `Lawie formats for your specific court — District Court, Sessions Court, or High Court.` | Delete the file | Nothing imports it (grep `PainSolution` finds only its own definition). Ajay: delete |

## 7. Section converter (done on the working tree; strings are Ajay's, signed file only)

The strings below are copied from `handoff/legal/section-converter-copy-signed.md` and nothing else. All four are already in the tree today, so this is a check for Ajay, not a new request.

| # | Where | Before (from the signed file) | After (signed, and found in the tree) |
| --- | --- | --- | --- |
| C1 | `app/tools/section-converter/page.tsx` ~130 | `This tool covers 500+ section mappings validated by a practising advocate. For professional drafting with auto-conversion, try Lawie's AI document generator.` | `This tool maps section numbers between the old and new criminal laws. Check the bare act before you rely on a mapping: a section number alone does not tell you which law applies to your case. For a first draft to review, try Lawie's drafting assistant.` (link `href="/login"`) |
| C2 | `app/tools/section-converter/layout.tsx:6` | `Free IPC to BNS, CrPC to BNSS, IEA to BSA section converter. Instantly look up old and new Indian criminal law section numbers. 500+ validated mappings.` | `Free IPC to BNS, CrPC to BNSS, IEA to BSA section converter. Look up old and new Indian criminal law section numbers. Check the bare act before you rely on a mapping.` |
| C3 | `app/tools/section-converter/page.tsx` ~65 | `Instantly convert between old (IPC, CrPC, IEA) and new (BNS, BNSS, BSA) section numbers. Free, no login required.` | `Look up old (IPC, CrPC, IEA) and new (BNS, BNSS, BSA) section numbers side by side. Free, no login required.` |
| C4 | `app/(marketing)/tools/page.tsx` ~69 | `Lookup any IPC, CrPC, or IEA section and get the equivalent BNS, BNSS, or BSA section instantly.` | `Look up an IPC, CrPC or IEA section and see the BNS, BNSS or BSA section that replaced it.` |

"Free, no login required" stays only if mahak confirms the page works without a login (Ajay's condition). A validation claim may return only as "Mappings checked against the Gazette text of the Acts", after T-267. Never "validated by a practising advocate" unless one has.

## 8. Found by the grep, not yet on anyone's list

| # | Where | Current (exact) | Proposed | Note |
| --- | --- | --- | --- | --- |
| X1 | `app/(marketing)/page.tsx:299` | `Start drafting in the next five minutes.` | `Your next draft starts here.` | A time claim. Already proposed in `copy/landing.md` and the grep table in `copy/pricing.md` |
| X2 | `app/(marketing)/terms/page.tsx:109-110` | `Lawie is an AI-assisted tool that generates draft legal documents formatted for Indian courts, built around the current criminal codes (BNS, BNSS, and BSA) and other applicable laws.` | Ajay writes the terms text. Flagged only: "formatted for Indian courts" is a court-formatting claim | T-252 says Ajay checks `terms/page.tsx` |
| X3 | `app/(marketing)/page.tsx:98`, `faq/page.tsx:81`, `privacy/page.tsx:188-202` | The "encrypted" sentences | No change from me. They are Ajay's signed privacy text: drafts and briefs are encrypted; form answers and the fact list are not yet. Not a "secure" or "encrypted" product claim in ad copy | Listed so the grep below is not a surprise. Ajay confirms they stay |

## 9. Grep list (12 Oct 2026, `grep -rn -i` over `apps/web/src`)

Run again after the build. Every hit in the "Hits today" column must be gone or be a line Ajay has signed.

| Term | Hits today | After the changes above |
| --- | --- | --- |
| court-ready | none | none |
| validated | none (the converter hits are gone from the tree) | none |
| in minutes | `about/page.tsx:119` | none (A3) |
| guaranteed | none | none |
| AI lawyer | none | none |
| secure | `terms/page.tsx:139` ("keep your credentials secure": about the user's password, not a claim about Lawie; Ajay to confirm it stays) | same |
| encrypted | `page.tsx:98`, `faq/page.tsx:81`, `privacy/page.tsx:188, 201, 202` (Ajay's signed privacy text, X3) | same |
| watermark | `pricing/page.tsx:130, 151, 178`, `faq/page.tsx:53`, `documents/[id]/page.tsx:561, 566` | none (W1-W5) |
| Priority support / Priority email support | `pricing/page.tsx:154, 181`, `UpgradeSuccessModal.tsx:23`, `settings/page.tsx:140` | none (pricing rows 15, M2, M3) |
| POPULAR / Popular | `TopUpModal.tsx:13, 229, 234` | none (M1) |
| court formatting / formatted for / Formats the cause title | `faq/page.tsx:53`, `about/page.tsx:82, 103`, `terms/page.tsx:109`, `PainSolution.tsx:7` | none, except `terms` (Ajay's text) |
| 5 minutes / five minutes | `PainSolution.tsx:7`, `page.tsx:299` | none (P1, X1) |
