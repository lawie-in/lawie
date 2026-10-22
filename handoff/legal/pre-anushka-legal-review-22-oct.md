# Pre-Anushka legal review of develop_staging (Ajay, 22 Oct 2026)

Founder's request via Priya: read every user-visible string and flow in code before Anushka's browser test. Method: four read-only reviewers by area (marketing and policies; auth, consent and email; signed-in app and billing; draft output), then my own check of the key findings against the code. Signed text below is final: leads paste it byte for byte. **MUST** = untrue or a legal risk, fix before Anushka. **SHOULD** = fix before main. Ticket groups are suggestions for Priya.

Fixes needed in files under `.claude/docs/legal-content-paths.md` (drafting rules, prompts, Terms, Privacy, Refunds, FAQ, nl-copy, welcome mail) come back to me for a byte check.

## Already ruled or in flight (no new text)

| # | Item | Where it stands |
|---|---|---|
| 0.1 | Sign-up reveals an existing account (409 "An account with this email already exists" plus referral R7), sign-up logs the user in, verify link lasts 24 h, raw password messages, verifying title, Hindi for verify and refusals | **T-522** (AJ-522-M1–M7, S1–S14). MUST before Anushka. |
| 0.2 | privacy@lawie.in in 5 mail templates and 2 body lines (and creditNote inherits it) | **T-559** (AJ-559-M1). MUST before Anushka. |
| 0.3 | Privacy §3 "We do not currently keep backups" | **T-532** (AJ-DB-2a) if Flex. Also fix the same sentence in `faq/page.tsx:81` (item 12). |
| 0.4 | Persona line "court-ready" (`template-engine.service.ts:2983`) | Raised from "next ticket" to **now** (item 30), because it is live on the form path. |

## A. Marketing and policy pages

| # | Sev | File:line | Current | Signed fix |
|---|---|---|---|---|
| 1 | MUST | `(marketing)/tools/page.tsx:14` meta | "Free legal tools. Built around the new Indian criminal codes." | `Free legal tools for Indian advocates.` |
| 2 | MUST | `about/page.tsx:78-79` | "Maps IPC, CrPC, and IEA references to their current BNS, BNSS, and BSA equivalents." | `Criminal drafts use BNS, BNSS and BSA section numbers, or IPC, CrPC and the Evidence Act where the old law applies.` (T-252 A2 still stands. It supersedes AJ-555-M2's "stays", which was about the old-law sweep only.) |
| 3 | MUST | `about/page.tsx:82-83` | "Formats the cause title, prayer, verification, and advocate block for your selected court." | `Lays out the cause title, prayer, verification and advocate block in the draft.` (T-252 A1) |
| 4 | MUST | `about/page.tsx:96-104` | heading "Built on the current law" + mappings + court-rules paragraph | Heading `Section numbers`. Text `Criminal drafts use BNS, BNSS and BSA section numbers, or IPC, CrPC and the Evidence Act where the old law applies. Check every section before you file.` Delete the court-formatting paragraph. |
| 5 | MUST | `about/page.tsx:116-118` | "…first draft in minutes, on the current law, for the specific court in front of them." | `More document types, and Hindi drafting: coming soon. The goal stays the same: get an advocate from a blank page to a first draft to review, edit and download.` (T-252 A3) |
| 6 | MUST | `about/page.tsx:49-51, 54-57` | "…overnight, every format an advocate had relied on was citing the wrong sections" / "…still cites Section 437 CrPC. The registry sends it back." | Lines 49-51: `India's new criminal codes, the BNS, BNSS and BSA, came into force on 1 July 2024. Older matters still run under the IPC, CrPC and Evidence Act.` Delete lines 54-57: CrPC is still correct for older matters, and the registry claim is unverified. |
| 7 | MUST | `faq/page.tsx:23-25` | Q "Are the BNS, BNSS, BSA mappings reliable?" + A on correspondence tables | Q `Which criminal codes do drafts use?` A `Criminal drafts use BNS, BNSS and BSA section numbers, or IPC, CrPC and the Evidence Act where the old law applies. Check every section against the bare act before you file.` |
| 8 | MUST | `faq/page.tsx:40` | "…Hindi drafting is on the roadmap and rolling out template by template." | `Drafts are in English today. Hindi drafting: coming soon.` (T-252 F3) |
| 9 | MUST | `terms/page.tsx:152-154` | "Most documents use 2 Ink; short ones use 1. You are charged only after a draft is generated; a failed generation is not charged." | `You see the Ink cost of a draft before you generate it. If a draft fails to generate, no Ink is used.` (AJ-511-M1, M2). Reuse Terms version `2026-10-22` and keep the date: there is no prod acceptance yet (AJ-557-M1 logic). |
| 10 | MUST | `terms/page.tsx:229`, `contact/page.tsx:83-84` | `legal@lawie.in` | `contact@lawie.in` (AJ-517-M15). Update `t436-supplier-terms.test.tsx:86` with it. Same Terms version as item 9. |
| 11 | MUST | `refunds/page.tsx` (whole page) | Dated 1 June 2026, mentions annual plans, covers subscriptions only, no statutory carve-out | See **Refunds text** below. "Last updated" becomes the release date. |
| 12 | MUST | `faq/page.tsx:81` | "We do not currently keep backups…" | If Flex is chosen, same release as T-532: `We back up our database once a day and keep each backup in India (Mumbai) for up to 7 days. Download and keep your own copy of every document you need.` Until then the current sentence is true and stays. |
| 13 | MUST | `tools/page.tsx:96-97` (flag `tool_bail_checker`) | "…find out if bail is possible, which court has jurisdiction, and which BNSS section to cite." | Keep the flag **off** for Anushka and prod until I sign the tool's text. It is an outcome/advice claim. |
| 14 | MUST | Unused files with false claims: `landing/FinalCTA.tsx`, `landing/TrustBar.tsx`, `landing/WaitlistForm.tsx`, `landing/Footer.tsx`, `landing/Navbar.tsx`, `marketing/PriceToggle.tsx` | "Join thousands of young advocates…", "Every template reviewed by a practising lawyer", fake waitlist success, "Save 2 months" | **Delete** the files (as AJ-555-M3). Confirm nothing imports them first. |
| 15 | SHOULD | `SiteNav.tsx:55,116`, `about/page.tsx:131`, `FloatCta.tsx:36,38` | "Start Drafting Free", "Try Lawie free" | `Start free` (AJ-531-M1) |
| 16 | SHOULD | `faq/page.tsx:20`, `about/page.tsx:74-75` | Document lists that differ ("rent agreements, consumer complaints…", "from a structured form") | Use the signed Q4 list (AJ-511-M18), cut to the types live in the v1 picker (AJ-511-M16; plaints are off for v1, T-366). About: `Writes a first draft from what you describe.` |
| 17 | SHOULD | `faq/page.tsx:33-35` | Q "Which courts does Lawie format for?" | Q `Which courts can I draft for?` A `The courts in Lawie's court list. Check the cause title and format against your court's rules before you file.` |
| 18 | SHOULD | `faq/page.tsx:13` meta | "…documents, BNS/BNSS/BSA mappings, pricing…" | `Answers about Lawie: the documents it drafts, Ink and pricing, privacy, and how drafts work.` |
| 19 | SHOULD | `contact/page.tsx:12, 44, 58` | "we typically reply within 24 hours", "no forms, no queues" | Delete both claims. The grievance timelines (AJ-517-M11) are the only promised times. |
| 20 | SHOULD | `pricing/layout.tsx:7` meta | "Simple, transparent pricing." | Delete that sentence and keep the rest. |
| 21 | SHOULD | `nl-copy.ts:148` FAQ Q6 | "…Ink you already have stays until then." | Add at the end: `Top-up Ink stays.` (copy v1 §4.4) |
| 22 | SHOULD | `tools/page.tsx:123-124, 152-153` | custody limits "under BNSS" with no date; "Generate full drafts — not just section lookups." | `Generate a first draft to review and edit.` For custody limits, add `for an arrest on or after 1 July 2024`. |

**Refunds text (item 11), signed.** Replace the operative paragraphs with:
1. `Payments for plans and Ink top-up packs are non-refundable once the plan period has started or the Ink has been added to your account.`
2. `If you were charged twice for the same purchase, or charged by mistake, write to contact@lawie.in within 30 days. We will check and refund the extra amount to the original payment method, and issue a GST credit note.`
3. `Cancelling a plan stops future charges and takes effect at the end of the current billing period.`
4. `This does not affect any right you have under law.`

Remove every mention of annual plans until one is sold.

## B. Sign-up, consent, account and email

| # | Sev | File:line | Current | Signed fix |
|---|---|---|---|---|
| 23 | MUST | `apps/billing/src/routes/billing.routes.ts:174` | `/cancel` is behind `requireCurrentPrivacy` | **Remove the gate from `/cancel`.** A user who chose "Not now" must still be able to cancel and then close their account (T-343 §2, DPDP). No copy change. |
| 24 | SHOULD | `apps/gateway/src/middleware/rateLimiter.ts:46` | "Rate limit exceeded. Upgrade to Pro for higher limits." | `Too many requests. Please wait {n} minutes, then try again.` (T-221 limit line and variants). No upsell. |
| 25 | SHOULD | `email-worker/templates/auth/welcome.tsx:32,39,72-76` (not sent today) | Preheader "…your AI legal drafting workspace."; no footer | Before it is wired: preheader `Your Lawie account is ready.` Footer: the standard set (reset-mail footer1 with street address, `You are receiving this because you have a Lawie account.`, `Help, data and privacy requests: contact@lawie.in`, footer4). |
| 26 | SHOULD | `auth.service.ts:374-375` `PATCH /me` privacy-gated | Blocks name correction until re-accept | It stays for v1: correction stays available by writing to contact@lawie.in (privacy §7, true). Lift it with T-529. |
| 27 | SHOULD | Settings has no Privacy tab (export, withdraw consent) | Only by email today | T-529. Privacy §7 is truthful about the email route, so this is not a false statement now. |
| 28 | NOTE | Referral Ink granted at registration | T-234 strings are true today | Keep the T-234 strings until the grant moves to verification. Ship AJ-522-S2 only together with that server change. |

## C. Signed-in app, billing and editor

| # | Sev | File:line | Current | Signed fix |
|---|---|---|---|---|
| 29 | MUST | `dashboard/documents/[id]/page.tsx:611-626` | "Free tier exports include a watermark." + "Upgrade to Pro" | **Delete it, with no replacement** (site-copy-t252 W1–W5). It is false: there is no watermark. |
| 30 | MUST | `editor/exportUtils.ts:423-439` `exportDocx` | Word export has no disclaimer except on a starting draft | Every Word export carries the PDF's footer: `First draft generated with AI. Check it against the applicable law before filing. Lawie does not provide legal advice.` A starting draft carries its own signed footer instead, so there is exactly one (T-321). |
| 31 | MUST | `credits/PaywallModal.tsx:139-140` | "Or wait: log in tomorrow for free Ink — daily login bonus resets at midnight." | **Delete the line.** It is an unsigned offer, and the midnight is not IST. |
| 32 | MUST | `PaywallModal.tsx:124-126` | "50 Ink / mo · ₹799" | Add `Prices include GST.` beside the price. |
| 33 | MUST | `dashboard/dashboardCopy.ts:19` via `LowInkNudge.tsx:84` | "You have used your 5 Ink…" shown to unverified users who never got them | Do not show it to unverified users. The AJ-522 verify bar covers them. |
| 34 | MUST | `dashboard/Sidebar.tsx:174` | `isPro ? 'Pro plan' : 'Free plan'` (Solo shown as Free) | `{plan name} plan`, using the §4.1 names `Free`, `Solo` and `Pro`. |
| 35 | MUST | `Sidebar.tsx:132` | `mailto:support@lawie.in` | `contact@lawie.in` (AJ-517-M15) |
| 36 | MUST | `dashboard/new/page.tsx:855-856` | "…as they are reviewed by our legal team." | `No templates available yet.` |
| 37 | MUST | `sections/SectionFinderPanel.tsx:1118-1120` | "Type the old IPC and we'll show the BNS equivalent — or vice versa." | `Look up an IPC, CrPC or IEA section and see the BNS, BNSS or BSA section that replaced it.` + `Check the bare act before you rely on a mapping.` (section-converter signed) |
| 38 | MUST | `SectionFinderPanel.tsx:1322, 1340` | "Old · pre-2024"; green "Mapped · in force" | `Old law · before 1 July 2024`. Change the badge to `Mapped` (drop "in force") and show the signed merged/split badges (T-296). |
| 39 | MUST | `documents/[id]/page.tsx:235-240` | Fallback filing checklist, including "Print on legal-size paper" | **Show no checklist** when the template has none. Delete the fallback list. |
| 40 | MUST | `components/dashboard/DashboardCommandBar.tsx` + `lib/auth.ts` | `lawie:draft-prefill` (matter text) survives sign-out | Clear it on sign-out, and on read in both flows. Code change only. |
| 41 | MUST | `apps/drafting/src/routes/documents.routes.ts:983-984, 1451-1452`; `ai.service.ts:390, 403-404, 409-410, 415-416, 426-428` | "…your inputs are saved", "…your brief is kept", "The AI rejected the prompt… Try shortening the facts narrative", "The founder must set…", "contact support" | User-facing: AJ-539-M2 only (`The draft did not finish.` + `No Ink was used.` where true). The server's own text goes to logs only. No safety promise, no blame on the facts, no internal configuration shown. |
| 42 | MUST | `intake/DraftReadyStep.tsx:163` | chip "No charge" beside "Checks run for you" | `Included`, provided the checks cost no Ink beyond the draft. Otherwise remove the chip. |
| 43 | MUST (old flow) | `draft/PipelineStatus.tsx` | "Verifying your inputs…", "Cross-checking sections, dates, and jurisdiction. Takes about 2 seconds."; timed rotating lines; "No warnings"; "Your inputs are saved — re-trying does not lose anything."; "Usually around a minute…"; step labels Verifying/Validating; Hinglish "Ek baat dhyan mein aayi…"; "Looks correct — generate anyway"; "Verifier paused — pick one"; "Step 2 of 5 — verifying inputs"; "Error — verifier hard-blocked" | `Checking your inputs…` with no second line. Replace the rotating lines with one line, `Writing the draft…`. "No warnings" becomes the signed `NO_MISMATCH_FOUND` text. Delete "Your inputs are saved…" and "Usually around a minute…". Labels `Checking`. Hinglish becomes `Please check this before you generate.` Button `Generate anyway`. `Please choose one.` `Step 2 of 5 — checking inputs`. `The draft could not start.` **For Anushka:** keep `feature.describe_first` ON, so she uses the signed new flow, unless these are fixed first. |
| 44 | SHOULD | `PaywallModal.tsx:56, 59` | "Ink insufficient" / "You need {cost} Ink…" | `Insufficient Ink` / `This draft costs {cost} Ink — you have {balance}.` (AJ-539-M9) |
| 45 | SHOULD | `credits/TopUpModal.tsx:222, 254, 287` | Raw billing codes, "Please retry or contact support.", "Network error" | `Something did not work. Try again.` + `Retry` |
| 46 | SHOULD | `dashboard/dashboardCopy.ts:35-36` | `{a} draft, {b} finalised or exported (all time)` | **Signed now** (AJ-520-M1, earlier given by message only). |
| 47 | SHOULD | `Sidebar.tsx:172` | `Adv. {name}` | `{name}` only. Lawie does not check enrolment. |
| 48 | SHOULD | `intake/DraftReadyStep.tsx:232` | "…could not be saved… Please start again." | `The draft was written but could not be saved. Check your documents list before you start again.` |
| 49 | SHOULD | `OneFlow.tsx:381, 737` | "This document needs the Pro plan." (Solo blocked too) | It ships only if true for Solo (AJ-511-M16). Priya and Arjun confirm the gate. |
| 50 | SHOULD | Unused: `credits/GenerationFailedModal.tsx`, `LowBalanceModal.tsx`, `UpgradeSuccessModal.tsx` (if unused), `DraftReadyModal.tsx` | "Try again — no Ink charged", "Priority support", support@ | **Delete** once confirmed unused. |
| 51 | SHOULD | `SectionFinderPanel.tsx:929`, `form/DynamicFormRenderer.tsx:1187` `?q=` | Search term in the URL | OK only if the input is limited to section numbers and titles. Free text must use POST or sessionStorage (Tanvi's rule). |
| 52 | SHOULD | `billing/config/credit-skus.ts:73-74` badges | Not rendered | Remove them (AJ-535-M3). |
| 53 | NOTE | `billing/planCopy.ts:14` support@lawie.in | Allowed in the AJ-509-M2 line only | Founder confirms that mailbox is monitored. If not, use contact@. |

## D. Text inside and around the draft

| # | Sev | File:line | Current | Signed fix |
|---|---|---|---|---|
| 54 | MUST | `drafting/services/template-engine.service.ts:2981` (live form path, every non-switch pack) | "…NEVER reference old IPC, CrPC, or IEA section numbers." | `Use BNS section numbers for an offence committed on or after 1 July 2024, and IPC section numbers for an offence committed before that date. For procedure and evidence, use BNSS and BSA, except in a matter that was pending before 1 July 2024, where CrPC and the Evidence Act continue to apply. If the date of the offence is not given, write [To be confirmed: section and code].` |
| 55 | MUST | Same file `:2983` | "…drafting a court-ready legal document." | `You are a senior Indian advocate with 20+ years of practice, drafting a legal document for an advocate to review and file.` (AJ-557-M3, now) |
| 56 | MUST | `fir_quashing.json:72` and `quashing_528_bnss.json:87` (form labels) | "BNS / Special Act sections invoked (use BNS, NOT IPC)" / "(NOT IPC)" | `Sections invoked in the FIR (BNS, IPC or Special Act, as registered)` |
| 57 | MUST | `mact_claim.json:280` | "Para 6: FIR details — number, date, PS, BNS sections (S.281 BNS… was IPC 279…)…" | `Para 6: FIR details — number, date, PS, and the sections as registered in the FIR (BNS for an offence on or after 1 July 2024, IPC for an offence before that date). Annex certified copy.` |
| 58 | MUST | `surrender_application.json:153` | "Cite BNS sections for the underlying offences (never IPC)." | `Cite the sections of the underlying offence as registered (BNS for an offence on or after 1 July 2024, IPC for an offence before that date).` |
| 59 | MUST | `suspension_of_sentence.json:188` | "Use BNS section numbers for offences of conviction (never IPC)." | `Cite the sections of conviction as they stand in the judgment.` |
| 60 | MUST | `memo_of_parties.json:171` | "NEVER include any IPC reference…" | `Do not cite any statute in the memo of parties.` |
| 61 | MUST | `vakalatnama.json:183` | "Do NOT include any IPC / CrPC / IEA references…" | `Do not cite any section of substantive law in the vakalatnama.` |
| 62 | MUST | `affidavit_identity.json:186` | "Do NOT include any IPC reference — …use BNS Section 229…" | `Do not cite any penal provision in the affidavit.` |
| 63 | MUST | `legal_notice_defamation.json:198` | "…cite BNS Section 356(1)… (not IPC 499/500 — IPC stands repealed…)" | `Cite BNS Section 356 for defamation on or after 1 July 2024, and IPC Sections 499 and 500 for defamation before that date.` |
| 64 | MUST | `discharge_application.json:228-233, 241-243, 249-250`; `habeas_corpus.json:250-273`; `slp.json:244-246, 258` | "Cite Union of India v. Prafulla Kumar Samal…", "Cite Sunil Batra…", "Cite Pritam Singh…" and others | **Delete every "Cite <case>" instruction** and add the T-441 line (as in the other 68 packs). The form path runs no citation check (`removeUngivenCitations` runs on the brief path only), so these cases would print unchecked. Lawie names no judgment the advocate did not give. |
| 65 | MUST | ~49 packs `"Append Lawie disclaimer: 'Lawie is a drafting assistant…'"` in `promptInstructions` (`grep -n "Append Lawie disclaimer" apps/drafting/src/config/document-rules/*.json`); ~38 packs with mandatory clause "Advocate Responsibility Disclaimer" / "Standard Lawie disclaimer"; `certiorari.json:148`, `quo_warranto.json:127`, `interim_application.json:132`, `curative_petition.json:125` structure items | Disclaimer instructions inside the pleading | **Delete all three kinds.** The disclaimer belongs only in the export footer and the page notice (T-317 Addendum 5). Also add "Lawie is a drafting assistant" to the body strip filters (`sanitiseAIBody`, `withoutDisclaimers`) as a safety net. |
| 66 | SHOULD | `prompt-assembler.ts` (no route since T-443) | "NEVER reference old IPC…", "Use today's date…", "court-ready" | **Retire the file.** If it is kept, apply items 54 and 55. |
| 67 | SHOULD | `quashing_528_bnss.json:312`, `criminal_appeal.json:340` `relevantActs` descriptions | "use BNS numbers, not IPC" | `Substantive offence sections: BNS for an offence on or after 1 July 2024, IPC for an offence before that date.` |
| 68 | SHOULD | `list_of_dates.json:131`, `synopsis.json:142` | "INFO — events post 01.07.2024 should cite BNS…" | `INFO — check that each section cited matches the code in force on the date of the offence (BNS on or after 1 July 2024, IPC before).` |
| 69 | SHOULD | `maintenance_bnss_144.json:34, 275` | "CRITICAL: Use Section 144 BNSS — never refer to Section 125 CrPC…" | `Use Section 144 BNSS for a petition filed on or after 1 July 2024. Refer to Section 125 CrPC only for an earlier order, or for a proceeding pending before that date.` |
| 70 | SHOULD | `discharge_application.json:239, 246` | "Pin-point page numbers in chargesheet." / "(S.300 CrPC not attracted)" | `Refer to a chargesheet page only where the advocate gives it; otherwise write [To be confirmed: page].` Line 246: drop the section and write `(the bar on a second trial does not apply)`. The BNSS equivalent: verify. |
| 71 | SHOULD | `apps/drafting/scripts/seed-sample-pdfs.ts:82-86, 105, 109-111, 134, 137` | Realistic names: a public figure's name as the accused drawer, a real-format enrolment number at a real chamber, real-sounding firms accused of wrongdoing | Plainly fictional placeholders: `Sh. A. B. Sample`, `Adv. Sample Advocate`, `Enrolment: SAMPLE/000/0000`, `M/s Sample Beverages Pvt. Ltd.`, `M/s Sample Store`, PAN `AAAAA0000A`. MUST before any sample PDF is served. |
| 72 | SHOULD | `gpa.json` `filing_checklist` | Names "Suraj Lamp v. State of Haryana (2012) 1 SCC 656" in UI text | Remove case law from the checklist (T-441). |

## Needs a running page or config (cannot judge from code)

1. Whether `NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME` is set (footer and privacy §11 show the M11 line). This is a launch blocker.
2. Whether any request goes to Google Analytics or Tag Manager before Accept, and whether a _ga cookie appears after Decline.
3. Whether `feature.describe_first` is on for Anushka (item 43), and which packs are live (plaints, items 16 and 49).
4. That the review-before-filing notice shows on every opened draft. Check a PDF and a DOCX export (item 30).
5. A form-path draft for an offence in 2023 (fir_quashing, discharge): it must cite IPC, not BNS (items 54–63). The body must carry no "Lawie is a drafting assistant" and no case name the advocate did not give (items 64–65). No "court-ready" anywhere.
6. An unverified Free user at 0 Ink on /dashboard (item 33), and a Solo user's plan label (item 34).
7. A "Not now" privacy user: can they cancel and then close their account (item 23)?
8. The resend throttle actually shown versus the server limit (AJ-522-M4), and sent mails rendering the real street address with no placeholder marker.
9. The database tier in prod (items 0.3 and 12) and whether the support@ mailbox is monitored (item 53).
10. Supplier lines in Terms §1/§14 load at runtime.

## Count

MUST: 0.1, 0.2, 1–14, 23, 29–43, 54–65 (43 items, counting 0.1 and 0.2). SHOULD/NOTE: the rest.

## Answers to T-567 questions (Mahak via Priya, 22 Oct)

| Ref | Question | Ruling |
|---|---|---|
| 41a | AppSettingMissing / auth-config failures | Yes. Every server failure before `done` shows `The draft did not finish.` The configuration detail goes to logs only. |
| 41b | When to show "No Ink was used." | **Only where the route has released the hold before sending the error event** (the T-521 rule in `generationFailure.ts`). `classifyLlmError` only labels the failure and never decides the Ink line. If the route cannot confirm the release, show no Ink line, and add the neutral `Check your documents list to see where this draft stands.` |
| 41c | rate_limited, NETWORK | Yes: both show `The draft did not finish.`, with the Ink line per 41b. |
| 41d | Hindi | The server sends a code. The web shows the signed EN or HI from its own strings (`ड्राफ़्ट पूरा नहीं बना।` / `कोई Ink नहीं कटा।`, AJ-539-M2). The server's English text goes to logs only. |
| 24 | {n} in the rate-limit line | Compute {n} from the reset time (`Retry-After`), rounded up to whole minutes, with a minimum of 1. Use the T-221 variants: n = 1 gives the one-minute line, and no Retry-After gives the generic `Too many requests. Please wait a few minutes, then try again.` It applies to both limiters (60 s and 15 min). |
| 25 | welcome.tsx footer (after T-559) | footer1: the reset mail's street-address builder. footer2 `You are receiving this because you have a Lawie account.` footer3 `Help, data and privacy requests: contact@lawie.in` footer4 `Privacy Policy: https://lawie.in/privacy · Terms: https://lawie.in/terms`. **Keep** `Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.` (pinned by the T-557 test). |

## Answers to T-564 questions (Kunal, 22 Oct)

| Ref | Question | Ruling |
|---|---|---|
| A1 | Refunds "Last updated" | `22 October 2026`. |
| A2 | Rest of the Refunds page | (a) Meta description: `Lawie's refund policy for plans and Ink top-up packs.` (b) Keep the billing-contact paragraph as it is (contact@). (c) Keep `This policy is governed by Indian law.` as it is. |
| A3 | Annual-plan mentions in the Terms | **No change to the Terms.** The removal applies to the Refunds page only. The T-433 sentence and §6 "monthly or annual basis" are conditional and true, so they stay as pinned. |
| A4 | Lines that now contradict Refunds paragraph 2 | Terms payments sentence: `All payments are non-refundable, except as set out in our Refund Policy. This does not affect any right you have under law.` (reuse version `2026-10-22`, no prod acceptance yet). FAQ refunds answer: `Payments are non-refundable once the plan period has started or the Ink has been added. If you were charged twice or by mistake, write to contact@lawie.in within 30 days. See the Refund Policy.` `nl-copy.ts:148`: replace "are not refunded; see the Refund Policy." with `are non-refundable except as set out in the Refund Policy.` |
| A5 | FAQ document list | Use the Q4 list (`nl-copy.ts:140`), minus every type not live in the v1 picker on develop. If civil packs are off, drop `plaints` and `written statements`. Both FAQ lists must match. Priya confirms the live list. |
| A6 | Contact page | (a) Meta: `Email contact@lawie.in.` (b) Hero: `Email is the fastest way to reach us.` (c) Delete the "We typically reply within 24 hours." paragraph. |
| A7 | Where "Top-up Ink stays." goes | Straight after `Ink you already have stays until then.` |
| A8 | Custody-limits line | OK: `…default bail eligibility dates under BNSS for an arrest on or after 1 July 2024.` |
| A9 | About paragraph 3 | Keep it as it is (signed now). It describes the problem, not a product claim. |

## Answers to T-565 questions (Tanvi, 22 Oct)

| Ref | Question | Ruling |
|---|---|---|
| T1 | NO_MISMATCH_FOUND in the old form flow (no brief) | Not true there. The old flow gets its own line: `The drafting checks flagged nothing. Read the draft before you use it.` Show it only when the stream sent no warning event. |
| T2 | Does row 43 retire "Citing sections…"? | Yes, in the old flow. Change the t555 test to assert that `Citing BNS / BNSS sections…` is absent, not that `Citing sections…` is present. |
| T3 | Breadcrumb "Checking … Checking" | Not intended. The Verifying step becomes `Checking inputs` and the Validating step becomes `Checking the draft`. |
| T4 | "Auto-detects either direction. Press ⌘K from any drafting screen." | Cut "Auto-detects either direction." Keep `Press ⌘K from any drafting screen.` (functional). |
| T5 | `Prices include GST.` on its own line under the price | OK. |
| T6 | Other PipelineStatus strings | Signed: "Skip and generate anyway" → `Generate anyway`. "Let me fix this — edit form" → `Edit the form`. "Error — drafting could not finish" → `The draft did not finish.` "Step 3 of 5 — drafting (streaming)" → `Step 3 of 5 — writing the draft`. "The AI service returned an error mid-draft. Please try again." → `The draft did not finish.` with the Ink line per 41b. Any other PipelineStatus string not listed in row 43 or here: keep the old flow off for Anushka (`describe_first` ON) and send the list to me before main. |
| T7 | Finder card shows "Mapped" for every type | `Mapped` only for a direct one-to-one mapping. Merged and split types use their signed T-296 badges. Repealed and unverified types show **no** status badge until I sign one. |

## Answers to T-566 questions (Shashank, 22 Oct)

| Ref | Question | Ruling |
|---|---|---|
| 54a | Does item 54 replace both sentences? | Yes. The item 54 text replaces both. |
| 54b | Civil form packs (rent_agreement, nda, mou…) | Send the item 54 line **only to packs in a criminal category**. Civil packs get no code line at all. |
| 54c | BNS whitelist line | Keep the list. Replace the lead-in with: `When you cite a BNS section, cite only one from this verified First Schedule list:` Keep the sub-section sentence after it unchanged. As written now, it reads as "cite only BNS". |
| 54d | Validator "Use Section X BNS instead" | In scope if validator.ts is in your claim; otherwise Priya tickets it. New warning: `Check the code: Section {x} BNS replaced Section {y} IPC for an offence on or after 1 July 2024.` Show it only when the offence date is on or after 1 July 2024 or not given. Never show it for an earlier offence. |
| 62 | `affidavit_identity.json:173` | `Do not cite any penal provision in the affidavit.` (same as :186) |
| 64a | Whole line or proposition only | Per R1: delete the judgment name, its citation and its connector, and **keep the proposition word for word**. Per R2: a line that only says to cite goes whole. Add S once, last. |
| 64b | discharge :244 and :248 | Yes, include them under R1. |
| 64c | habeas_corpus and slp `_meta.change_protocol` | Edit them per R6 as amended: `All edits require CLO sign-off. Do not name judgments in model-visible text (Ajay, T-441).` |
| 64d | Discharge Para 10 and the T-429 gate | Confirmed: proposition only (R1), and the gate keeps working. I byte-check the wording at READY. |
| 65a | gift_deed `(14) Lawie disclaimer.` | Delete that item only. |
| 65b | filing_checklist "Lawie disclaimer included" (12 deed packs) | Delete it. The disclaimer is in the footer, not the deed. |
| 65c | sale_deed.json:362 own disclaimer sentence | Delete it. Add a second filter phrase, `Lawie is not legal counsel`. |
| 65d | Unread `disclaimer` / `advocate_disclaimer` keys | Leave them. Add a test that the loader never sends them to the model. |
| 65e | brief-drafter `isDisclaimer`/`withoutDisclaimerText` | Yes. Add both phrases to all three filters. |
| 65f | criminal_revision after T-472 | Noted. |
| 66 | prompt-assembler.ts kept | OK: apply items 54 and 55. **Delete** rule 9 ("Use today's date format…"); it conflicts with the signed date rule. |
| 67 | quashing_528 :312 whole description | Replace the whole description with the item 67 text. Drop the "Common: S.85 … was IPC 498A … S.351" list (R5). |
| 68 | list_of_dates.json:94 addendum (7) | `(7) For each section cited, use the code in force on the date of the offence: BNS for an offence on or after 1 July 2024, IPC for an offence before that date. For procedure, use BNSS, except in a matter pending before 1 July 2024, where CrPC continues to apply.` |
| 69 | maintenance_bnss_144 `_meta.change_protocol` | Keep the CLO sentence and replace the second with: `Use Section 144 BNSS for a petition filed on or after 1 July 2024; refer to Section 125 CrPC only for an earlier order or a proceeding pending before that date.` |
| 71 | seed-sample-pdfs mapping | Every person's name becomes `Sample Person {n}`, with Sh./Smt. kept as in the source and n in order of first appearance across the script. That includes Meena Devi, Priya Sharma, Dinesh Agarwal, Ankit Verma, Rahul Kumar and Manoj Tiwari. Each advocate becomes `Adv. Sample Advocate`. The chamber becomes `Chamber No. 0, Sample Bar Association Building, Patna`. The enrolment becomes `SAMPLE/000/0000`. Firms become `M/s Sample Beverages Pvt. Ltd.` and `M/s Sample Store, Patna`. PANs become `AAAAA0000A`, `AAAAA0001A` in order. Update the PARTY ROLES line to match. Each regenerated PDF comes to me before it is served. |
| 72 | gpa :372 and related lines (gpa:378, spa:334/339/346, joint_development_agreement:642) | R1 for all of them: keep the proposition ("GPA does not transfer title…") and drop the name, citation and connector. |
| 55 | post-processor.ts:620 comment | No objection. Fix it. |
| A5-final | FAQ document list (Kunal, flag state from Priya) | Signed: `Bail applications, legal notices, writ petitions, maintenance petitions, written statements, affidavits.` in both `faq/page.tsx` and `nl-copy.ts:140` (after T-522 merges). Only plaints are off in v1. If `feature.template_civil_plaint` turns on, `plaints` returns, with my re-check. |

## Byte check T-564, fix/t-564-legal-pages @ cb014014: approved (Ajay, 22 Oct 2026)

Items 1–12 and 14–20, 22 and A1–A9 match this file byte for byte (26 strings checked by script; the Terms A4 sentence is exact once the Refund Policy link markup is joined). The deleted files are gone. None of the barred phrases remain (legal@, "within 24 hours", "no queues", "Most documents use", "mappings reliable", "in minutes", "Start Drafting Free", "built around", "Maps IPC", "Formats the cause", "full drafts"). The Terms keep version 2026-10-22 and "Last updated: 22 October 2026", as ruled. **Open:** item 21, `nl-copy.ts:140` (drop "plaints, ") and `nl-copy.ts:148` (A4) go with T-522 and **must land before Anushka**: until then the landing FAQ's "not refunded" contradicts the new Refund Policy. Item 13: the flag stays OFF.

## Byte check T-565 wave 1, fix/t-565-legal-app-web @ 1021aed9: approved (Ajay, 22 Oct 2026)

Items 29, 31, 32, 34, 35, 36, 37, 38, 39, 43 (T1, T3, T6), 44, 47 and 50 match byte for byte. None of the removed strings remain (watermark, the daily bonus offer, "reviewed by our legal team", "Auto-detects", "Mapped · in force", "Old · pre-2024", the legal-size checklist, "Verifying your inputs", "Your inputs are saved", "Usually around a minute", the Hinglish line, "No warnings", "Ink insufficient", "Adv. {name}"). support@ remains only in the AJ-509-M2 line (item 53). The Sidebar shows the §4.1 plan name only once the balance has loaded. Item 49: noted as unreachable in v1, so nothing ships.

### Answers to Tanvi's wave 1 questions

| Ref | Question | Ruling |
|---|---|---|
| W1 | Ink cost unknown, failed card says "Check your documents list…" with no draft | Show `The draft could not start.` alone. No documents-list line and no Ink line. |
| W2 | Two "Generate anyway" buttons | Keep one and drop the second. |
| W3 | Pre-stream 403/400/409 | 403 from the verify or privacy gate: show that gate's signed message (AJ-522-M6 refusal, or the T-343 prompt). Other 400/409/403: `Something did not work. Try again.` + `Retry`. Never a raw reason. |
| W4 | `partial` and `repealed_no_equivalent` show no badge | Correct until I sign those badges (T7). |
| W5 | Synthetic ids like §NEW-n in the finder (T-326) | **Follow-up ticket, MUST before main.** Never show a synthetic id as a section number. Hide such entries until signed text exists. |

### Remaining old-flow strings (PipelineStatus), signed

| Current | Signed |
|---|---|
| Step 2 of 5 — verifier flagged something | `Step 2 of 5 — please check your inputs` |
| Drafting could not finish (heading over the failed card) | **Delete** the heading. The signed `The draft did not finish.` shows once only. |
| Please review the flagged inputs before generating. | Signed as is. |
| A required field is missing or contains an error. Please review the form. | Signed as is. |
| Cannot generate this draft | `The draft could not start.` |
| Edit form | `Edit the form` |
| Drafting your {templateName}… | `Writing your {templateName}…` |
| Draft ready | Signed as is. |
| {n} paragraphs. Sections: … | Signed as is, if {n} and the list are counted from the draft. |
| Open in editor / Try again | Signed as is. |
| Step labels Inputs received / Drafting / Ready | Signed as is. |
| Step 5 of 5 — ready | Signed as is. |

With these, the old flow is fully signed. `describe_first` may still stay ON for Anushka. That choice is Priya's, not a legal requirement.
| 63a | legal_notice_defamation.json:198, keep "If criminal route" | Yes, keep the condition. The whole line becomes: `If the criminal route is taken, cite BNS Section 356 for defamation on or after 1 July 2024, and IPC Sections 499 and 500 for defamation before that date.` |
| 65g | mandamus.json:159 `Disclaimer: Lawie is a drafting assistant; advocate is responsible…` | Delete it, as with item 65. Priya extends the claim to that line. It is the only change to mandamus.json (T-489's signed lines are untouched). |

### Answers to Tanvi's wave 2a questions (22 Oct)

| Ref | Question | Ruling |
|---|---|---|
| W5a | Hidden NEW entries leave an empty lookup | **This refines W5.** Show the entry under section-converter Addendum 2: old box `No equivalent in the {OldCode}`, new section and title shown normally, copy `{NewCode} {n}` only. Never show or copy the `NEW-n` id. |
| W6 | 409 "draft already in progress" | Hide Retry. Show `Check your documents list to see where this draft stands.` (signed). |
| W7 | Plan-gate 403 | Hide Retry. Signed: `This document is not available on your current plan.` |
| W8 | Not-started card, "Check the cost again" | Cut the notice (unsigned). Keep `Try again`, because nothing was charged. |
| W9 | GeneratingStep.tsx:132 "Drafting your {documentName}" | `Writing your {documentName}…` |
| W10 | "The draft could not start." twice on the hard-block card | Drop the step label, as proposed. |
| W11 | Addendum 2 details (Tanvi) | Insert into a draft keeps the normal `§{n} {NewCode}`, and Addendum 2 governs Copy only. The search row stays as it is (the detail box carries `No equivalent in the {OldCode}`). New-provision rows show no `Mapped` badge. W8 extended: cut the unknown-cost notice and `Check the cost again` on every card (not-started, SoftWarn, request-failed). |
| W12 | Pre-stream 401, 402 without data, 429, no body and read errors; greyed button with no reason | Generic `Something did not work. Try again.` + `Retry`: OK, because nothing started or was charged. The disabled button stays (AJ-511-M1: cost before generate). Signed reason line: `You can generate once the Ink cost is shown.` English only for now; Rajesh decides placement. |
| W13 | CONNECTION_LOST; one status line; OneFlow fallback reasons | `Connection lost. Check your documents.` is signed (AJ-521-M1). A failed draft shows one status line, either `No Ink was used.` (only if inkReleased) or the documents line, never both. OneFlow :753, :791-793, :816, :886 show no reason (''), under `The draft did not finish.` + the 41b line. :745 (pre-start) uses `The draft could not start.` |

### Answers to Shashank's batch 2 questions (T-566, 22 Oct)

| Ref | Question | Ruling |
|---|---|---|
| S1 | Item 54 scope | The 14 criminal-category packs, **plus writ_petition_criminal**. maintenance_bnss_144, mact_claim, legal_notice_defamation and affidavit_identity get no item 54 line: their own lines (69, 57, 63, 62) govern. |
| S2 | Whitelist heading and the "does not exist" sentence | Keep both. They speak only of BNS numbers. |
| S3 | affidavit_identity "False statements in affidavits attract BNS Section 227 … same as IPC 191/192." | **Delete it** (item 62: no penal provision in the affidavit). |
| S4 | discharge :250 (Nitya Dharmananda) | **Delete the whole line** (R2). The proposition cannot stand without the case, and rewriting it would add law (R5). |
| S5 | Leftover topic fragments | Keep a fragment only if it is a complete proposition (e.g. "preventive detention requires strict compliance", "Article 136 not regular appeal"). Delete bare topic labels ("meaning of 'sufficient ground'.", "substantial question of law definition."). I check each one in the diff. |
| S6 | habeas (f) tail | Delete the tail. The item reads `(f) Missing person with state action suspected.` |
| S7 | slp change_protocol | Not intended. Signed: `Format STRICTLY per Supreme Court Rules 2013. All edits require CLO sign-off. Do not name judgments in model-visible text (Ajay, T-441).` |
| S8 | "Suraj Lamp disclaimer" labels | Replace the label with `title clause` (e.g. "…— title clause must be inserted"). This is the deed's own clause that a GPA does not transfer title, not Lawie's disclaimer. |
| S9 | Sample brand, invoice and addresses | `CoolDrink` becomes `SampleDrink`, the invoice `RKS/0042` becomes `SMP/0042`, and every street address becomes `Sample Road, Patna`. |
| S10 | discharge checklist and gpa `_meta` | Checklist: `Court orders / judgments relied on`. gpa `_meta.change_protocol`: `The title clause must appear prominently…`, with the rest unchanged. |
| S11 | Validator warning blocked by the missing offence date | Separate ticket after Mahak's merge, for the date scoping. **Now:** change the warning text to the signed `Check the code: Section {x} BNS replaced Section {y} IPC for an offence on or after 1 July 2024.` It is true whatever the offence date, so it may fire unscoped until then. "Use Section X BNS instead" must go now. |
| S11a | Arjun's choice for the interim validator warning: suppress, or a neutral line | **Neutral line, not suppression.** It replaces my S11 interim text and is signed: `This draft cites Section {x} IPC. Confirm the offence date: BNS applies to offences on or after 1 July 2024, IPC to offences before that date.` Show it on any IPC citation, whatever the date, until the date-scoped follow-up lands. Then it gives way to the scoped item 54d warning. |

### Byte check T-565 wave 2a, fix/t-565-legal-app-web @ 88c4aa8f: approved (Ajay, 22 Oct 2026)

W5a, W6–W13, rows 42 and 48, and the pre-stream routing all match. No NEW-n id renders (the regexes and comments remain). The "Drafting could not finish" heading is gone (a comment only remains). `Cannot generate`, `Drafting your` and `No charge` are gone. **W14:** in the pre-generate cost line (`InkCostLine.tsx`), `We could not work out the Ink cost for this. Try again in a moment.` + button `Check the cost again` are **signed** there. They are a true, functional retry that serves AJ-511-M1. **On the GeneratingStep failure card, cut the notice**: W8 holds there, and the W12 line under the disabled button is enough. The OneFlow W13 lines follow after Vishal's merge.
| W15 | Re-check at 91f7b777; the disabled button is a dead end if the cost never loads | **Approved at 91f7b777.** Only GeneratingStep changed, per W14. Dead end: the signed button `Check the cost again` (W14) **may** be reused, as a button only, on the GeneratingStep and PipelineStatus failure cards beside the W12 reason line, so the user can re-fetch the cost. No notice text is added. Whether to add it is Rajesh's or Priya's call. Legally either way is fine. |

### Answers to Shashank's batch 3 flags (T-566 @ f5d340f5, 22 Oct)

| Ref | Question | Ruling |
|---|---|---|
| S5a | Keeps and deletes | OK, except habeas line 1: delete the repeated "'habeas corpus is the great writ of liberty.'", because the sentence before it already says it. The other keeps and all four deletions stand. |
| S8a | "title clause paragraph" | Drop "paragraph": `— title clause must be inserted` (gpa, spa). jda `— title clause required` is OK. |
| S9a | Remaining sample places | Ranchi rent-agreement addresses become `Sample Road, Ranchi` (keep the state right). `Village Barh, Dist. Patna, Bihar – 803213` becomes `Sample Village, Dist. Patna, Bihar`. Bank branch becomes `Sample Branch, Patna`. In the s.138 sample, give the respondent `Sample Lane, Patna` so the two parties do not share an address. |
| S11b | CrPC and IEA validator lines | Signed. CrPC: `This draft cites Section {x} CrPC. Confirm the date: BNSS applies to proceedings from 1 July 2024; CrPC continues for matters pending before that date.` IEA: `This draft cites Section {x} of the Evidence Act. Confirm the date: BSA applies from 1 July 2024; check whether the Evidence Act still governs this matter.` (The pending-matter savings under the BSA: verify, so the line does not state them.) Both replace the old "Use Section X … instead" and "Please verify" texts. |
| S12 | gpa and spa `_meta.description` naming Suraj Lamp | Leave them. `_meta` is not sent to the model (R6), and only `change_protocol` was in scope. |

## Byte check T-567, fix/t-567-legal-server-export @ 4189ce3e: approved (Ajay, 22 Oct 2026)

- Item 23: `/cancel` no longer has `requireCurrentPrivacy`.
- Item 52: SKU badges are removed.
- Item 30: Word and PDF exports use `EXPORT_DISCLAIMER_FOOTER`, exact to row 30, or the starting-draft footer instead. Exactly one footer.
- Item 24: the three T-221 lines are exact. {n} comes from Retry-After, rounded up, minimum 1. Both the account and public limiters use them. No upsell.
- Item 41: every `classifyLlmError` case shows `The draft did not finish.`, with the detail in logs only. `inkReleased` is not set (the web shows no Ink line until the release is confirmed). "Inputs are saved", "brief is kept", "founder must set" and "contact support" are gone.
- **Question:** the pre-stream 500 body `{ error: 'Generation failed', message: 'Unknown generation error' }`. **Drop the English `message` field.** Keep the machine `error` code only. The web shows its own signed text for a pre-stream failure (W12).

### Answers to Tanvi's wave 2b questions (22 Oct)

| Ref | Question | Ruling |
|---|---|---|
| B1 | Empty body from the drafting start (OneFlow ~:773) | OK: `The draft did not finish.` + the documents-list line, with no Ink claim. |
| B2 | Dropped connection (OneFlow ~:837, ~:907) | OK: the signed `Connection lost. Check your documents.` alone (AJ-521-M1). It is accurate and makes no Ink claim. |
| B3 | Coupon reasons (`topup-quote.service.ts` QUOTE_REASONS) shown in the top-up modal | **Signed as they are**, with one fix: `cannotApply` gets its full stop (`This coupon cannot be applied to this item.`). The others are signed: `Coupon not found or inactive.`, `Coupon has expired.`, `This coupon does not apply to the selected item.`, `Coupon has reached its usage limit.`, `You have already used this coupon.`. They are factual and come from the server's own checks. Any other raw billing text keeps row 45's generic line. |
| B4 | Low-Ink nudge hidden unless verified (fails closed) | OK. Hiding it can never make a false statement. |
| B5 | OneFlow pre-stream 409/429/401 and 403 | Align them with the old flow now. 409: the documents line, no Retry (W6). 429/401: `Something did not work. Try again.` + Retry (W12). Plan 403: replace "This document needs the Pro plan…" with `This document is not available on your current plan.` and no Retry (W7), even though the line is unreachable in v1. |
