# For Anushka's next run on develop

Priya collects each lead's "What a user can now do" text here after a merge into `develop_staging`. Anushka gets only this text, the address, the account state and the draft allowance (`.claude/docs/quality-gate.md`). It reaches `develop` when the founder merges `develop_staging`.

## Setup before the run (Priya, 12 Oct 2026)

- `feature.describe_first`: on for the signed-in account (founder checked, 12 Oct).
- `feature.fact_ledger`: not set in the database today, so it is off. Before Anushka tests T-189, once T-189 is on `develop`, the founder adds the app setting `feature.fact_ledger` with the same value as `feature.describe_first` (his user id, or the comma-separated list of ids). Never `on`: that would switch it on for every user, and it stays off for real users until T-187, T-188, T-190 and T-194 are done.

- For default bail (T-251): `feature.fact_ledger` must also be ON for her test account, or the default bail template isn't offered.

- Build note for anyone building the web app: the lead shells set NODE_ENV=development, which makes `next build` fail at prerender. Use NODE_ENV=production.

- Until Ajay has signed the IPC→BNS table recheck (T-267): in the Tier A criminal samples, check each BNS section number the draft cites against the bare act.

## T-208 (shashank, merged to develop_staging d305233, 11 Oct 2026)

- When I sign up with a mistyped email, a short or weak password, or leave my name, email or password out, I see what is wrong instead of "Internal Server Error".
- When I sign in without a password or with a bad email, I am told what is missing.
- If several things are wrong, I see all of them at once.
- Signing up and signing in with correct details works exactly as before.

## T-209 (shashank, merged to develop_staging d35ecee, 11 Oct 2026)

- I can sign up and be signed in straight away, or tap "Sign in" twice, without an error.
- I can be signed in on two tabs or devices at once; logging out of one leaves the other signed in.
- I am not signed out by this release; my existing session keeps working.

## T-197 (mahak, merged to develop_staging d74d063, 11 Oct 2026)

- When my draft is ready, I always see "Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.", whether or not the checks flagged anything.
- When the checks flag something and the warning box shows, I see that line once, not twice.
- When I reopen a saved document, I see the same line above the text.
- It reads the same on my phone and on a desktop.
- The Word and PDF files I download have the same footers as before.

## T-210 (shashank, merged to develop_staging 37a1d32, 11 Oct 2026)

- I sign up and sign in exactly as before; nothing looks or works differently.
- My email, name, phone number and password are no longer kept in Lawie's server logs or in error reports, even when something goes wrong while I sign up or sign in.


## T-189 (vishal, merged to develop_staging 8bab9f7, 12 Oct 2026)

Needs the `feature.fact_ledger` setup above, or she sees the old path.

- I am a district-court advocate drafting a bail application, regular or anticipatory. I give the sections I am charged under and my grounds for bail in my own words. Before, the draft marked both as missing even though I had given them. Now every section and every ground I gave appears in the draft.
- If I gave neither, the draft still shows both as missing.
- If I gave three grounds and one cannot be found in what I wrote, I still get the other two, and I am told the system could not find that detail in what I wrote.
- If I repeat the same section twice in my list, it appears once.
- I can add, remove or change entries in my list and the draft follows.
- If a draft leaves out one of my sections or grounds, or rewords a ground, I am told to check it instead of it quietly disappearing.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-194 (mahak, merged to develop_staging 324416e, 12 Oct 2026)

Before her run, someone checks by hand: a real PDF render, the em dash in the fallback PDF, the DOCX opened in Word, and "Export DOCX anyway" in a browser.

- The bold, italic and underlined text from my draft now shows in the Word file.
- Before I export, I get a warning with the number of items still to be confirmed.
- I can go back and fill them in. That puts me on the first blank.
- Or I can export anyway.
- Each blank prints bold and highlighted in yellow, in both Word and PDF.
- "DRAFT — N items to be confirmed" prints at the top of every page.
- If nothing is blank, there is no warning and no header, as before.
- The registry case number in the title, the signing date in the verification and the signature line are not flagged.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-227 (shashank, merged to develop_staging efa610b, 12 Oct 2026)

- The Ink a document shows is the Ink taken.
- Bail (regular and anticipatory) and consumer complaint now show 2 Ink, which is what they were always charged.
- Most long documents now cost the 2 Ink they already showed.
- A document type the app does not recognise is refused with a clear message, and no Ink is taken.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-248 (shashank, merged to develop_staging 4787900, 12 Oct 2026)

- A review petition cites the criminal review bar under S.403 BNSS, with no mention of a proviso that does not exist.
- A habeas corpus petition cites S.100 BNSS for the search of a wrongfully confined person.
- The discharge form offers the right third option, a warrant case before a Magistrate on a complaint under S.268 BNSS, in place of a summons case that never had discharge.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-251 (mahak, merged to develop_staging 871f7c6, 12 Oct 2026)

Needs `feature.fact_ledger` ON for her test account, or the default bail template isn't offered.

- A default bail draft no longer cites any judgment you did not give, and it never counts days.
- You choose the period (60 days, 90 days, or a period under a special Act) and the date it expired. Lawie does not decide which one applies.
- An offence with a 10-year maximum is no longer forced into 90 days.
- Missing details show as "[To be confirmed: ...]" blanks, and the export warning counts them.
- Until the old/new law choice arrives, the prayer names the provision as a blank for you to confirm (CrPC 167(2) or BNSS 187(3)).
- The undertaking to furnish bail bonds appears only when you tick it. If it is unticked or answered "No", you get a blank, never "will not furnish".
- Earlier bail applications are stated as you give them.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-200 (vishal, merged to develop_staging 89afcef, 12 Oct 2026)

- When I draft a bail application and Lawie says every required clause (FIR details, custody, grounds, undertaking, earlier bail applications) is in the draft, it really is.
- A clause whose paragraph was rewritten, renumbered or emptied is now flagged, instead of passing because its old paragraph number still exists.
- Fixed wording in an English draft must actually appear. In Hindi drafts the cue words count. If the draft is not in English, Lawie tells me the fixed wording was not checked.
- When Lawie cannot confirm a clause, the draft is marked "starting draft".
- Some bail drafts that passed before can now carry the "starting draft" label when a required part's paragraph holds only a blank such as "[To be confirmed: …]" (for example interim bail urgency or duration with no detail given). That is intended.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-252a (mahak, merged to develop_staging 5355604, 12 Oct 2026)

- The section converter page no longer says its mappings are validated or that it converts instantly.
- The page heading and the Tools card say you can look up old and new section numbers side by side, free and without logging in.
- The link at the bottom of the converter now reads "Lawie's drafting assistant".

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-235 + T-254A (mahak, merged to develop_staging 77a06ec, 12 Oct 2026)

- I can read a privacy policy that says what Lawie stores, where it is kept, which details are encrypted and which are not, who else receives them, and how to ask for my data to be erased.
- When I ask "How is my case data handled?" on the home page or the FAQ, I get a plain answer that does not promise more than is true, including that there are no backups yet.
- When I press "See what you can draft" on the home page I go straight to the list of documents; no sample files are offered.
- The payment lines say payments go via Razorpay, with no "secure" claim and no promise of a GST invoice.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-250 + T-255 (shashank, merged to develop_staging ee76d8e, 12 Oct 2026)

Needs develop's section tables reseeded first (Arjun does this on develop; the converter items below show nothing new before that).

- In the section converter and in drafts that convert old sections, I get the corrected new section for Evidence Act and CrPC sections (for example CrPC 358 and 362).
- A production-of-documents draft lists the right privilege sections of the Bharatiya Sakshya Adhiniyam.
- The Chief Judicial Magistrate court note cites the right BNSS section.
- Affidavits are no longer checked against an Evidence Act section that has nothing to do with affidavits.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-233 + T-271 (mahak, merged to develop_staging 0e965e7, 12 Oct 2026)

- Bold, italic and underlined text, and drafts I never edited, now export to Word and PDF with their full text. (A draft I never edited used to give an empty Word file.)
- The PDF has the wider 1.5 inch margin on the left, where the binding goes.
- If an export fails I see "Export failed. Please try again." with Try again and Dismiss, instead of nothing happening. After a failed "Export anyway", Try again opens the blanks dialog again (by design).
- "[To be confirmed: ...]" blanks are found and highlighted however they are capitalised.
- On the privacy page I can reach and scroll the table with the keyboard alone.

Note for her run: the 1.5 inch margin is on the browser-fallback PDF. A real .docx opened in Word and a measured PDF page were not checked by hand: check both.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-256 + T-264 (vishal, merged to develop_staging addd9e7, 12 Oct 2026)

Nothing new on screen. This makes the team's automatic checks reliable: a test that failed at random now passes on its merits, and the sample bail application used to catch invented facts is checked on every change.

Quality: nothing to test in the UI — tests, a test fixture and CI only.

## T-273 + T-274 (mahak, merged to develop_staging 346cde7, 12 Oct 2026)

- If I write "a < b & c" or "<Name>" in a plain-text draft, I see it exactly as written in the editor, the Word file and the PDF.
- "[To be confirmed: ...]" shows in the PDF even when a missing detail was written in lower case, and it is counted at the end of intake.
- The editor and every export show the same paragraphs whatever line endings the draft has, and headings are found in the PDF even with extra blank lines.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-275 (mahak, merged to develop_staging 5900d7f, 12 Oct 2026)

Needs develop's section tables reseeded first for the Evidence Act and CrPC rows to show it.

- I look up an old section that was repealed with no replacement and see "Repealed — no equivalent" and "None", instead of a raw code and a blank "Section".
- I see "Not verified" and "Check the Gazette" for a section Lawie has not confirmed, instead of a guessed number.
- I am not offered a Copy button when there is no section to copy.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-281 (mahak, merged to develop_staging 089eb8c, 12 Oct 2026)

- On a phone, the section converter page no longer slides sideways: the search box and the Look up button sit one above the other, and the old and new sections are shown one above the other with an arrow between them.
- "Check the Gazette" reads on one line on most phones.

This is NOT a "works on mobile" claim (T-138 and the T-141a ban stand).

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-237 (vishal, merged to develop_staging 8f31985, 12 Oct 2026)

- When I draft an anticipatory bail, an interim bail or a bail application before a magistrate, the draft has its own part on earlier bail applications: each one I mentioned, with the court, the date of the order and the result.
- If I did not say whether there was an earlier application, the draft gives me a marked blank to confirm. It never claims on its own that this is the first application.
- If a draft leaves earlier applications out, it is flagged as missing that part. In an interim bail draft, the usual line that the main application is pending does not count as that disclosure.
- In an anticipatory bail draft, the "Undertakings" part sets out what the applicant undertakes to do if granted bail, never as facts about the applicant.
- In an interim bail draft, "Roots of the Applicant" appears only when my brief gives those facts; otherwise it is left out and nothing is invented.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)
