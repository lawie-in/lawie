# For Anushka's next run on develop

Priya collects each lead's "What a user can now do" text here after a merge into `develop_staging`. Anushka gets only this text, the address, the account state and the draft allowance (`.claude/docs/quality-gate.md`). It reaches `develop` when the founder merges `develop_staging`.

## Setup before the run (Priya, 12 Oct 2026)

- `feature.describe_first`: on for the signed-in account (founder checked, 12 Oct).
- `feature.fact_ledger`: set by the founder, 12 Oct 2026, with the same value as `feature.describe_first` (no id is written here). The rest of this paragraph is the original instruction, kept for the record. Originally: not set in the database, so it was off. Before Anushka tests T-189, once T-189 is on `develop`, the founder adds the app setting `feature.fact_ledger` with the same value as `feature.describe_first` (his user id, or the comma-separated list of ids). Never `on`: that would switch it on for every user, and it stays off for real users until T-187, T-188, T-190 and T-194 are done.

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

## T-267 (shashank, merged to develop_staging ee93984, 12 Oct 2026)

The first item works without a reseed; the second and third need develop's section tables reseeded first (Arjun does it on develop).

- Several drafts cite the right BNS sections: dowry death BNS 80, false evidence BNS 227, 228 and 229, defamation 356(1) and 356(2), and the sub-sections for cheating 318(4) and criminal breach of trust 316(2).
- The section converter and old-to-new conversions in drafts use IPC to BNS pairs rechecked against the Gazette text. A few old sections are marked "not verified" and show no BNS section.
- The bail checker no longer reports an old IPC section that has no new equivalent as if it were a different BNS offence. (The bail checker page does not yet show the "No BNS equivalent" note: T-278.)

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-238 (mahak, merged to develop_staging 59e4ac8, 12 Oct 2026)

- On the pricing page I read that most documents use 2 Ink and short documents 1, and that a failed draft is not charged, instead of "each document uses 1 Ink".
- The Free plan reads "Every line of the draft is yours to change" and "Criminal drafts use BNS, BNSS and BSA section numbers", with no court-formatting or validation claims.
- The plans and packs carry no "Most Popular", "POPULAR" or "BEST VALUE" labels.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-282 (vishal, merged to develop_staging 4958b96, 12 Oct 2026)

Nothing new on screen. Tests only: the signed wording of the bail packs' earlier-applications and undertakings parts can no longer change by accident without a test failing.

Quality: nothing to test in the UI — tests only.

## T-279 (mahak, merged to develop_staging d0a51bf, 12 Oct 2026)

- A "to be confirmed" blank still counts as a blank when it comes back in lower case, and no longer draws a false "may not belong" warning.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-263 (vishal, merged to develop_staging 4a51d23, 12 Oct 2026)

- When a draft would name a case you did not give, the whole case name is now removed, not only the reporter. Both sides and the versus word go, so no half-name is left beside the blank.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-283 (vishal, merged to develop_staging 797cefd, 12 Oct 2026)

Nothing new on screen. With the develop environment default on, a tester no longer needs the two feature switches set by hand for each account.

Quality: nothing to test in the UI — a server setting only.

## T-226 (mahak, merged to develop_staging 4087d6f, 12 Oct 2026)

- Ink is set aside when a draft starts, so drafts running at the same time cannot overspend.
- Ink comes back if a draft fails, or the user leaves before anything is saved.
- A second click or a second tab gets "Draft already in progress" and no extra charge.
- "Not enough Ink" shows before the draft starts.

Test: open the same draft in two tabs at once and confirm you get one draft and one refusal.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-285 (vishal, merged to develop_staging 50720bd, 12 Oct 2026)

- A long draft no longer stops partway when the server is quiet for a minute. The page stays connected until the draft finishes.

Test: generate one long draft (many sections) and confirm it completes without the page dropping or showing an error.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-288 (mahak, merged to develop_staging 66753fc, 12 Oct 2026)

- In the rare case that a finished draft's Ink cannot be taken because of a system fault, the user sees "not enough Ink" instead of getting the draft free, and is never charged for a draft they were not given.

Nothing to test in a browser: the case cannot be reproduced there.

Quality: nothing to test in the UI — a rare fault path that no user can trigger on demand.

## T-269 (vishal, merged to develop_staging 9ddda55, 12 Oct 2026)

Nothing new on screen. The build now stops on a code error instead of hiding it, and CI checks it on every push.

Quality: nothing to test in the UI — build and CI only.

## T-115a (mahak, merged to develop_staging 7c697a2, 12 Oct 2026)

- Nothing changes on screen: saved case details are now stored encrypted.

Test: open an old draft and a new one. Both still show their details, checklist and annexures as before.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-266 (vishal, merged to develop_staging 633aa29, 12 Oct 2026)

- When Lawie checks a draft for required facts, a word that only contains a cue word ("background" for "ground") no longer counts.
- The FIR number must appear exactly, not inside a date, a longer number or a different FIR like "12-A", so a missing fact gets caught.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-115e (mahak, merged to develop_staging 2355979, 12 Oct 2026)

Nothing changes on screen. When Lawie has no template for what a user describes, it records only the general category, never the user's words or names.

Quality: nothing to test in the UI — a privacy change in stored records.

## T-277 (shashank, merged to develop_staging 0e4832a, 12 Oct 2026)

- The bail checker and timeline tracker show the correct offence titles, bail and cognizance status, and maximum term from the official First Schedule.
- A sub-section such as 103(1) or 316(2) is understood as part of its main section.
- Where the Schedule depends on the facts, it says "Depends. Check the First Schedule." instead of guessing.
- Bail advice names BNSS 480 or 483 based on the maximum sentence.
- A section that creates no offence is said to be left out.
- Drafts use the same classification.
- A section number written without IPC or BNS gets a reminder to add the code.

Note: the section tables on develop are live only after Arjun reseeds develop.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-284 (kunal, merged to develop_staging f1819ef, 12 Oct 2026)

- The Privacy Policy now says what Lawie keeps if you join the waitlist (name, email, and phone, city, practice area and the link you came from if given), kept until you ask for deletion and never more than 18 months after you joined or Lawie last wrote to you.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-291 (tanvi, merged to develop_staging 38433f3, 12 Oct 2026)

- On a phone, you can remove a section you added, or a file you attached, by tapping a clear button next to it, without hitting the wrong one.
- On a computer the remove "x" sits beside each section and works from the keyboard. A screen reader reads it as "Remove" plus the name.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-292 (mahak, merged to develop_staging 613e151, 12 Oct 2026)

Nothing changes on screen. Lawie no longer asks the AI to name the user's matter when it looks for a template.

Test: describe a document; Lawie still finds the right template, or offers choices, as before.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-289 (shashank, merged to develop_staging ad6db61, 12 Oct 2026)

- The bail checker names the trial court exactly as the First Schedule prints it ("Any Magistrate", "Court of Session") instead of guessing from the sentence. A 3-7 year offence triable by a Magistrate is no longer sent to Sessions.
- With several sections, Court of Session wins if any section is triable there; otherwise the higher Magistrate is shown.
- Where the Schedule gives no single court, the bail checker and the section finder say "Depends on the offence. Check the First Schedule."

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-293 — bail draft reads the sections charged safely (cf05202)

- Nothing changes on screen. A bail draft's bailable / non-bailable lines still match the sections charged.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-290 — section picker shows what each section was read as (83a5c07)

- Under Sections Charged, a reminder that a bare number is read as a BNS section.
- Under each section added, what Lawie read it as before drafting ("Read as BNS 303: Theft", "Read as IPC 302").
- "Checking this section" shows while it checks; a red warning appears if the check fails or the entry isn't a section.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-309 — section picker hardening (ed989ee)

- If one section can't be checked, only that one shows the warning; the others still show what they were read as. A failed check is retried once by itself.
- Entries go up to 100 characters, up to 30 sections; at 30 the box stops taking more.
- On a phone, a long section name wraps inside the box and its remove button stays visible.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-297 — court notes defer to the First Schedule (9b4468b)

- Court notes no longer say which court tries a case from the length of the sentence. They say the First Schedule to BNSS decides, which matches the court the bail checker shows.
- The Magistrate (JMFC) note no longer says it only tries offences up to 3 years.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)
