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
