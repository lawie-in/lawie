# Quality run 3 — the product on develop — FAIL

- **By:** Anushka (CQO), from the founder's chat, with three helper agents in their own tabs. She wrote the verdict alone.
- **When:** 13 Oct 2026, finished about 04:54 IST.
- **Build:** `develop` at `2c7e39b` (PR #93 merged), as running on the founder's Mac.
- **Where:** the founder's Chrome, through the Claude extension.
- **What she was sent:** `handoff/tickets/anushka-run.md`, every entry from the top down to and including T-335. T-344, T-334, T-345 + T-340 and T-351 were skipped (not on develop yet). She was also asked to check phone and desktop widths, the cookie card, sign-up, privacy and terms pages, and three realistic drafts (bail, s.138, one civil).
- **This file is her report, word for word.**

## Her notes before the report

- **Account:** the founder's account "Adv. Abhi", Free plan. It started at 9 Ink; the founder topped up to 25 during the run, and it ended at 14. A first account in the browser ("Adv. Shera Singh", 5 Ink) was used only for the public pages before the founder signed in.
- **Six drafts made, all with made-up facts:** regular bail (Patna), anticipatory bail (Gaya), default bail (Ranchi), Magistrate bail (Lucknow), an s.138 notice, and a plaint for recovery of money (Delhi). Nothing was deleted, exported, bought or changed in settings.
- **Left in the account:** one helper typed a test line ("offence u/s 1034 BNS, 2023 and Section 420 IPC; Rs. 5,00,000; 30 days; page 12.") into the plaint draft `6acd6b989d9b5710e3805371`.
- **Exports:** no PDF or DOCX was downloaded. Downloading needs the founder's permission, which was asked for but not given, so every export check is BLOCKED.
- **Phone width:** Chrome would not go below a 606 px viewport, so a true 375 px check was not possible.
- **Sign-up:** a real throwaway sign-up was not done. In the shared browser it would have replaced the founder's session in every tab. Only the error messages were tested.

## Her report

**Overall: FAIL.** The drafts state facts the advocate never gave, the section converter gives wrong section numbers, and two free tools give wrong legal results.

### Entries

- **T-208: PASS.** Empty or bad fields showed clear messages, several at once, and never "Internal Server Error".
- **T-209: BLOCKED.** I did not complete a real sign-up. It would have signed every tab out of the founder's account. The existing session kept working throughout.
- **T-197: PASS.** The line "Lawie is a drafting assistant…" shows once above every draft. Checking the Word and PDF footers needed downloads, so that part is BLOCKED.
- **T-210: PASS** for what a user can see: sign-in works as before. I can't see the logs.
- **T-189: FAIL.**
  - To reproduce: describe a regular bail with three grounds and sections "BNS 318(4), BNS 316(2), BNS 318(4)", then generate.
  - The brief showed my grounds as "[To be confirmed]".
  - The draft dropped my main ground (the dispute is civil, from a failed land-sale agreement of 2 Mar 2025) without telling me.
  - It invented a ground I never gave: "already undergone prolonged custody" (he had been in custody three weeks).
  - It printed "318(4), 316(2), and 318(4)", so the duplicate was not removed.
  - A lawyer expects every ground given and no others, with each section listed once.
- **T-194: BLOCKED for the files.** The warning before export appears and "Go back and fill" lands on the first blank. But the warning counts 2 items while the result page said "5 blanks to fill".
- **T-227: FAIL.**
  - No screen shows the Ink cost before "Confirm brief and continue".
  - The dashboard and settings say "8 of 5 documents used — 0 remaining", yet drafting still works.
  - Settings offers "Upgrade to Pro — ₹799/month, Unlimited document generations". The pricing page says Pro is ₹1,999 for 150 Ink.
- **T-248: BLOCKED.** No draft was made for it. The template descriptions do show S.403 BNSS and S.268 BNSS correctly.
- **T-251: FAIL.**
  - To reproduce: default bail, set "will furnish bail bonds" to No.
  - The brief promises a blank, but para 7 still says he "undertakes… to furnish bail bonds".
  - Para 8 invents facts: "not been convicted of any offence… roots in the community".
  - Correct parts: no case law cited, no days counted, and the period, expiry and provision are left as blanks.
- **T-200: FAIL.** "Checks run for you" reports things as missing that are in the draft, and every draft was marked "starting draft" because of them.
  - Earlier bail "None" is in para 9.
  - Antecedents are in para 8.
  - Recovery is in para 7.
  - The sections are in para 1.
  - The applicant's name is in the anticipatory bail draft.
  - "72 years" (the mother's age) was flagged as a "period".
- **T-252a: PASS.**
- **T-235 + T-254A: PASS.** The privacy page and the "case data" answer are honest, including that there are no backups. "See what you can draft" goes straight to the list. Payments are described as through Razorpay with no "secure" claim.
- **T-250 + T-255: FAIL.** The CrPC → BNSS mappings are one section off:

  | CrPC | Converter shows | Bare act |
  |---|---|---|
  | 358 | 398 | 399 |
  | 359 | 399 | 400 |
  | 360 | 400 | 401 |
  | 361 | 401 | 402 |
  | 362 | 402 | 403 |

  BNSS 398 is the witness-protection scheme. To reproduce: open the converter and look up "362 CrPC". The production-of-documents draft, the Chief Judicial Magistrate note and the affidavit check were not tested.
- **T-233 + T-271: PASS** for reaching the privacy table by keyboard (at desktop width). The exports are BLOCKED.
- **T-273 + T-274: BLOCKED** (downloads).
- **T-275: FAIL.** Repealed sections are handled well: 497 and 309 IPC show "Repealed — no equivalent / None" with no Copy button. But a section Lawie hasn't confirmed shows a guessed wrong number (CrPC 358–362 above) or "No mapping found" (156(3) CrPC), never "Not verified / Check the Gazette".
- **T-281: BLOCKED** at 375 px. At 606 px the page stacks and nothing slides sideways.
- **T-237: PASS.** The anticipatory bail draft has its own earlier-applications part, as a blank when not stated, and its undertakings are worded as undertakings. Interim bail was not drafted.
- **T-267: PASS.** 304B → 80, 420 → 318(4), 406 → 316(2), 500 → 356(2). The bail checker says "No BNS equivalent" for 497 IPC.
- **T-238: PASS** on the pricing page. The settings page and FAQ contradict it (see T-227 and T-317).
- **T-279: BLOCKED.** Not provoked. The plaint showed 14 false "may not belong" warnings, on its own PRAYER, VERIFICATION and similar headings.
- **T-263: PASS.** No draft named an unsupplied case. The default bail draft used "[Authority — add if relied upon]".
- **T-226: BLOCKED.** The brief doesn't carry over to a second tab, so both tabs could not be readied. A double-click on Confirm gave one document.
- **T-285: PASS.** All six drafts finished in about 30–60 seconds without dropping. None was very long.
- **T-115a: PASS.** Old and new drafts are listed, and the new ones open with full details.
- **T-266: BLOCKED.** Not provoked.
- **T-277: FAIL.**
  - To reproduce: open the bail checker and type "BNS 318(4), BNS 316(2)".
  - The result says both "do not create an offence". Without "BNS" they work.
  - BNS 303(2) theft is shown as "1 to 5 years". The first-offence maximum is 3 years.
  - "Most serious offence" picks 316(2) (5 years) over 318(4) (7 years), and over 103(1) murder.
  - A bare "351" gets no reminder to add the code.
- **T-284: PASS.**
- **T-291: BLOCKED.** No section picker could be reached.
- **T-292: PASS.** Each description led to the right template.
- **T-289: PASS.** 318(4) and 316(2) give "Magistrate of the first class". 103 gives Court of Session.
- **T-293: PASS.** Nothing contradicts. The draft carries no bailable/non-bailable line at all.
- **T-290, T-309, T-295, T-324: BLOCKED.** "Use template →" opens the generic description page, so no section picker is reachable.
- **T-297: PASS.** There is no "up to 3 years" line in the Magistrate draft.
- **T-300: FAIL.** With the field left empty, the default bail draft printed "[To be confirmed: advocate name]" instead of the profile name "Abhi".
- **T-296: FAIL.**
  - To reproduce: open the Bulk Text Converter and paste "Sections 420, 406 and 120B IPC and Section 156(3) CrPC…".
  - Only 120B was converted, so 420 and 406 now read as BNS sections.
  - 156(3) CrPC and 65B of the Evidence Act were left unchanged, with no warning.
  - The bulk results never show "None" or "Not verified", or any merged/split label.
- **T-311: BLOCKED.** The profile has no enrollment number, and I may not change settings.
- **T-234 + T-298: PASS.** The `?mode=signup` link opens Create account, and the terms and privacy line shows. Google sign-in and the "no connection" message were not tested.
- **T-268: PASS.** All four points are present, including "Last updated: 12 October 2026" and the Consumer Commission right.
- **T-241: FAIL.**
  - Anticipatory bail: "law-abiding citizen with roots in his community", "no history of fleeing… ties to his village and his business", and "business dispute" (it was a boundary quarrel).
  - Magistrate bail: "woman of good character", "no prior criminal antecedents".
  - None of these were given. A lawyer expects a blank, or nothing.
- **T-317: FAIL.**
  - The FAQ free tier still lists "court formatting, BNS validation".
  - The About page says "Exports a finished document".
  - The Tools card shows "S.115(2) BNS → Bailable · S.480 BNSS". Bail in a bailable offence is under S.478.
- **T-306: FAIL (minor).** The home tab title reads "Lawie — Legal drafting for Indian advocates". Signed-in pages read correctly. The address bar stays clean.
- **T-278: PASS.** Old-law, non-offence and not-found sections each get the right note in the timeline. "BNS 103" and "103-BNS" work.
- **T-318: BLOCKED.** No annexures were produced for any draft, and downloads were not done.
- **T-319: BLOCKED.** It needs `develop` on https.
- **T-313: PASS** for the draft: BR/1234/2015 printed in the advocate block. The field sits under Facts, not Court & Parties. The Vakalatnama and Memo of Parties are BLOCKED because none were produced.
- **T-280: PASS.** Titles show under each number.
- **T-322: PASS.** The anticipatory bail blank was kept as is.
- **T-321: BLOCKED** (downloads).
- **T-326: PASS.** 111 BNS shows "No equivalent in the IPC", and Copy gives "BNS 111".
- **T-299 + T-308 + T-325: PASS.** An unknown email gives "Email or password is incorrect". The privacy page says Google Analytics runs on public pages only and sets `_ga` cookies. Wrong password on a real account was not tested.
- **T-327: PASS.** The default bail period and expiry stayed as blanks.
- **T-310: PASS.** Accept and Decline are equally prominent, the card reopens from the footer and the privacy page, and the choice was left as Declined.
- **T-190 + T-199: FAIL.**
  - The questions are asked with buttons, and "Not known" or "None" produced no claim in the draft.
  - On the brief, pressing "Not known" clears the row instead of selecting it. This happened for investigation stage, named in FIR and cooperation.
  - The anticipatory bail flow never asks about the Section 35 notice or recovery.
  - The fact-ledger-off half is BLOCKED.
- **T-328 + T-332: PASS** for focus after the cookie card. The private-mode part is BLOCKED (no private window available to me).
- **T-339: BLOCKED.** No private window available to me.
- **T-270: BLOCKED.** No wrong section came up in the generated drafts.
- **T-336: BLOCKED.** The fact-ledger setting can't be switched off.
- **T-333: BLOCKED.** Same reason.
- **T-341: FAIL.** The Magistrate bail description said "No bail application filed earlier" and the questions were skipped. The draft both states it and adds a blank on the same point, with no warning to check before filing. Two parts passed: the anticipatory bail blank when nothing was stated, and no warning in my regular bail after I confirmed "None".
- **T-240: FAIL.**
  - The templates library is grouped correctly.
  - "Browse document types" shows one flat list.
  - "Use template →" drops the chosen template.
  - Some cards show internal text such as "Document-rules config for default_bail".
- **T-338: PASS.** Facts that were never asked show as clear blanks (e.g. brief facts).
- **T-192: FAIL.**
  - To reproduce: s.138 brief, return memo received 15 Sep 2026, notice sent 30 Oct 2026. No warning appears that the notice is outside 30 days, and Confirm stays available.
  - The memo-received and notice dates given in words were not filled into their fields.
  - The notice is dated correctly (05.10.2026).
- **T-242: PASS.** `/login?ref=TESTCODE` fills the referral box, and campaign tags drop out of the address bar. The privacy page says the tags are kept.
- **T-347: BLOCKED.** "1034 BNS" typed into the editor was not flagged. It's unclear whether the check runs only when a draft is generated.
- **T-335: PASS.** Occupation and local ties I typed survived a description edit. "Not known" can't be seen on the brief (see T-190).
- **Entries with nothing to test on screen:** T-256 + T-264, T-282, T-283, T-288, T-269, T-115e.

### Also checked

- **Phone width (375 px): BLOCKED.** Chrome stops at a 606 px viewport. At that width the home page and converter display correctly.
- **Cookie card, sign-up, privacy and terms pages: PASS** on reading. The privacy page is candid about AWS Mumbai, data held outside India, and Helicone keeping data it can't delete.
- **Free tools, legal errors:**
  - **377 IPC note:** says it was "Struck down" in *Navtej*. It was only read down.
  - **Timeline tracker:**
    - It says no police remand is possible after day 15. Under BNSS 187 the 15 days can be taken in parts within the first 40 or 60 days.
    - It cites "187(4)" for the 60/90-day periods; that provision is 187(3).
    - Its default-bail date is one day later than the day count in *ED v. Kapil Wadhawan* (2023).
- **Bail drafts as an advocate would file them: FAIL.** None is fileable.
  - Every draft invents antecedents, roots or character, or an extra ground.
  - The Magistrate bail verification reads "Pooja Devi, S/o Rajesh Kumar" for a married woman.
  - The Magistrate bail draft misstates the BNSS 480 proviso for women.
- **s.138 notice: FAIL.**
  - Para 8 says the offence is already committed by issuing the cheque. It is complete only on non-payment within 15 days of receiving notice.
  - It invents "the account did not exist".
  - It drops the proprietor and the payee's address.
- **Civil plaint for recovery of money (Delhi): FAIL.**
  - It is addressed to the "Additional Sessions Judge", a criminal court.
  - The cause title is blank, although both parties' names were given.
  - It pleads the wrong limitation article (Art. 23 instead of Art. 14/15).
  - It pleads its own non-compliance with s.12A pre-institution mediation, which invites rejection under *Patil Automation*.
  - It invents a 12% interest rate.
  - The prayer and verification are each printed twice.
  - It contains a "DISCLAIMER" paragraph in the advocate's voice.

`Quality: FAIL — Anushka, 13 Oct 2026, 04:54 IST.` Main reasons:
- Bail drafts state facts the advocate never gave: antecedents, roots, character, an invented ground, a bond undertaking after "No".
- The section converter maps CrPC 358–362 one section off.
- The bail checker calls cheating and criminal breach of trust "not an offence".
- The "Checks run for you" panel gives false findings on every draft.
- The s.138 brief does not warn when the notice is sent more than 30 days after the return memo was received.
- The plaint is addressed to a Sessions Judge.
