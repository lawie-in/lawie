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

## T-300 — server-only values in drafts (048a632)

- Nothing changes on screen.
- The advocate name typed on the form, or a "to be confirmed" placeholder, appears on both the draft and the annexures; with the field empty, the profile name.
- A default bail draft's jail line says "to be confirmed".

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-296 — section converter on a phone (32fc50b)

- On a phone, convert a long passage in the section converter without results running off the screen.
- Sections merged or split in the new law show a plain label (verify scope / check which new section applies).
- "None" appears only for repealed sections; an unknown new section says Not verified and to check the Gazette.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-311 — enrollment number from the profile (0bff26f)

With a profile that has an enrollment number:

- Leave the enrollment field empty: the profile number prints in the draft, the Vakalatnama and the Memo of Parties.
- Type a number, or "to be confirmed": that prints.
- Type another advocate's name with the enrollment field empty: the number stays blank.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-234 + T-298 — email and password sign-up and sign-in (b4d6b58)

- Create an account or sign in with email and password as well as Google; a link can open straight on Create account.
- Clear messages for bad details, an existing email (quick switch to Sign in), a wrong password or no connection.
- The terms and privacy line shows, and Lawie records the acceptance.
- A referral code's bonus Ink is given once, or the user is told once if it can't apply.
- A Google-only advocate trying a password gets a plain "incorrect" message pointing to Google.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-268 — terms page (f6566b4)

Open /terms and check:

- It calls Lawie a drafting assistant whose drafts the advocate reviews and is responsible for.
- It says drafts are paid for with Ink: most use 2, short ones 1, nothing for a failed draft.
- It says nothing takes away rights under law or the right to approach a Consumer Commission.
- "Last updated: 12 October 2026". No "AI-assisted" or "formatted for Indian courts" in the page body (the footer is T-317).

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-241 — bail drafts don't assert facts the user didn't give (6bb8f85)

- Anticipatory and magistrate bail drafts no longer claim grounds, antecedents, roots or a filed charge sheet the user didn't give; a missing fact gets a blank to fill.
- In regular and default bail, "before this Hon'ble Court" no longer counts as covering earlier applications.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-317 — one consistent description across the site (ca2d88f)

- The home page, FAQ, About and Tools pages and the site footer all describe Lawie the same way: a drafting assistant for Indian advocates, where criminal drafts use BNS, BNSS and BSA section numbers and the advocate is responsible for legal accuracy and filing.
- FAQ answers say each document is a first draft generated with AI that the filing advocate must review.
- An exported PDF's footer reads "First draft generated with AI. Check it against the applicable law before filing. Lawie does not provide legal advice."

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-306 — login stays out of the address bar and analytics (ba54d48)

- Sign in with Google as before. The sign-in no longer puts the login in the page address, browser history or analytics.
- The dashboard, drafts and login pages are no longer tracked; only public pages are counted, without query details.
- The browser tab title reads "Lawie — Drafting Assistant for Indian Advocates".

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-278 — bail checker and timeline show signed notes (92efbc3)

- In the bail checker, an old IPC section with no new equivalent, or one not in the table, shows a clear note to check the Gazette, instead of a blank or a guessed section.
- In the timeline tracker, every section left out of the period says why: it's an old-law section (with a pointer to the section converter), it doesn't create an offence, or it wasn't found in the BNS offences table.
- Typing "BNS 103" or "103-BNS" in the timeline works like typing 103.
- Unknown values show "Depends…", never "Non-Bailable" or a guessed court.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-318 — footers on server PDFs, annexures and the welcome email (f5e7edb)

- Export a draft as PDF from the server; the footer reads "First draft generated with AI. Check it against the applicable law before filing. Lawie does not provide legal advice."
- Open the annexures (Vakalatnama, Memo of Parties and the others); the footer reads "Draft prepared by Lawie from the details you entered. Check it before filing. Lawie does not provide legal advice."
- The welcome email says "Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing."

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-319 — Google sign-in can't be hijacked (2b02eae)

- Sign in with Google as before.
- A sign-in link someone else started can no longer log you into another person's account; you see "We couldn't finish signing you in. Please try again." and start again.
- Needs develop on https (founder's check).

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-313 — optional enrollment number on three documents (a6b2162)

- When drafting a regular bail, anticipatory bail or consumer complaint, type a Bar Council enrollment number (or a "to be confirmed" note) in the new optional "Bar Council Enrollment No." field under Court & Parties. It prints in the advocate block, the Vakalatnama and the Memo of Parties.
- Leave it empty and still get the draft: the profile number is used if the advocate is you, otherwise a blank to fill in.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-295 — old-law sections warn instead of block (2e06933)

- Enter an old IPC, CrPC or IEA section (e.g. "302 IPC"): a warning says it's an old-law section and points to the section converter for offences on or after 1 July 2024. You can continue with "generate anyway" instead of being blocked.
- The warning never shows a mixed label like "BNS Section 302 IPC".
- A BNS section that doesn't exist is still blocked.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-280 — converter shows section titles (d80774f)

- In the section converter, see the title of the old section and of the new section under each number, so a wrong number is easy to spot.
- Test only after the founder has reseeded develop (seed-sections --force), Ajay's condition.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-322 — a signed blank is accepted as is (e4523df)

- An anticipatory, magistrate or default bail draft that leaves the prescribed "To be confirmed" blank for a missing fact is accepted as is. It is no longer sent back to the AI for a rewrite that could invent the fact.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-321 — one AI footer per exported draft (36ea45e)

- Export a starting draft as PDF (in the app or from the server): one footer only, "Starting draft prepared with AI assistance from the details you gave. Not checked against court rules. Review every line before use. Lawie does not provide legal advice."
- Export any other draft: one footer, "First draft generated with AI. Check it against the applicable law before filing. Lawie does not provide legal advice."

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-326 — new BNS sections in the converter (d51311e)

- Look up a new BNS, BNSS or BSA section that has no old equivalent: it shows "No equivalent in the IPC" (or CrPC, IEA) instead of a made-up number.
- Copy gives just the new section, e.g. "BNS 111".

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-299 + T-308 + T-325 — sign-in hardening and privacy wording (991c0f6, 84d9e4c)

- A clear message when Google sign-in fails; a Contact support link if the account is deactivated.
- A wrong email or a wrong password gives the same answer either way.
- Linking Google signs out your other sessions; signing out ends the old login everywhere in the account service.
- The Privacy Policy says Google Analytics runs on public pages only and sets \_ga cookies.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-324 — matching IPC alias on a BNS entry (cf26a25)

- Enter a BNS section with its old IPC number in brackets, e.g. "BNS 303 (IPC 379)": no old-law warning when the IPC number truly corresponds to that BNS section.
- The warning still shows when the bracketed IPC number doesn't match, or when an IPC section is entered on its own.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-327 — default bail blanks accepted as is (cd5b32b)

- In a default bail where the user hasn't given the default-bail period or its expiry date, a draft that leaves the brief's own blank is accepted as is. It is no longer sent back to the AI for a rewrite that could invent them.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-310 — consent before Google Analytics (af975f2)

- First visit: a small card asks about analytics. Accept and Decline are equally prominent.
- Ignore it or press Decline, and nothing about the visit goes to Google.
- Press Accept and analytics starts at once, with no reload.
- "Cookie settings" in the footer or on /privacy reopens the card; Decline stops analytics and clears its cookies.
- The privacy page says the choice is kept with no IP or account link and is deleted after 12 months.
- On a small phone or with large text, the card text scrolls and the buttons stay in view.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-190 + T-199 — bail packs ask for the facts behind their averments (65d8707, mahak, 12 Oct 2026)

What a user can now do:

- When drafting a regular, interim, anticipatory or Magistrate bail application, be asked (after the required details, up to 10 questions) about earlier bail applications, criminal history, arrest date, investigation stage, health, whether the applicant is named in the FIR, recovery, cooperation, work, whether the applicant is the only earning member, who depends on them, local ties, the Section 35 notice and a co-accused's bail, using buttons for yes/no and stage answers.
- Answer "Not known" or "None" and get no claim about it in the draft; leave any of them blank and still get the draft.
- If the description says no earlier bail application was made, be asked to confirm it once; skip it and the draft leaves that line blank for them to fill.
- Test with the fact-ledger setting both on and off; the questions appear either way.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-328 + T-332 — cookie card focus, splash, no browser error reporting (5482b37, kunal, 12 Oct 2026)

What a user can now do:

- After answering the cookie card, keyboard and screen-reader users land on the page content with no stray focus stop left behind.
- The logo splash always finishes and the cookie card still appears, even when the browser blocks storage (private mode).
- Nothing about a visitor's browser goes to an error service, same as before.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-339 — splash with blocked storage (5adf962, kunal, 12 Oct 2026)

What a user can now do:

- With browser storage blocked (private mode, site data off), the opening logo animation plays and finishes normally with no error.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-270 — wrong-section warnings for code-first citations (e43420d, shashank, 12 Oct 2026)

What a user can now do:

- After a draft is generated, get a warning for a wrong section in any of the six codes, written any common way ("BSA 85", "85 BSA", "S. 85 of the BSA", "Ss. 3-5 BSA"). There's never a false warning for a real old IPC, CrPC or IEA section.
- Each section number is checked against the Act it's cited under, so "Section 3 BSA" no longer passes just because the Oaths Act has a section 3.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-336 — confirm a "None" on earlier bail applications, ledger off (273b6d4, mahak, 12 Oct 2026)

What a user can now do:

- With the fact-ledger setting off: if their description says "Earlier bail applications: None" (or nil, no, koi nahi and the like), see that question asked again to confirm it.
- Confirm it and get the draft saying it is the first application; skip it and get a blank in the draft to fill in instead.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-333 — every draft path checks sections in all codes (2852e94, shashank, 12 Oct 2026)

What a user can now do:

- Drafts made from a template, a brief or the guided flow get the same section warnings as any other draft. A wrong BSA, BNSS, IPC, CrPC or IEA section is flagged, not only BNS.
- Cite a range like "Ss. 100-105 BNS" without a murder warning when the facts don't mention a death. An explicit "BNS 103" still gets it.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-341 — warning when "first bail application" wasn't confirmed (08103ec, mahak, 12 Oct 2026)

What a user can now do:

- If a bail draft says no earlier bail application was made but they never confirmed that, see a warning asking them to check it before filing.
- If they said an earlier bail application was made and the draft still says it is the first, see a warning to correct the draft.
- Confirm "None" (or say it is the first application) and see no such warning.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-240 — templates grouped under plain-language categories (6a6cd2a, tanvi, 12 Oct 2026)

What a user can now do:

- Browse templates grouped under the 26 plain-language categories, in a fixed order, when starting a new document, changing the document type, or in the templates library.
- Admins see and filter by each document's category.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-338 — blanks for half-read or unasked bail details (10faf08, mahak, 12 Oct 2026)

What a user can now do:

- With the fact-ledger setting on: when a bail detail was only half-read from their description or was never asked, see a clear blank for it in the draft to fill in, instead of the point being left out.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-192 — cheque-bounce notice date checks (5dd6388, vishal, 12 Oct 2026)

What a user can now do:

- In a cheque-bounce notice, enter the cheque validity, return-memo-received and notice-sent dates. Lawie checks presentation in time and notice within 30 days, and only then lets the notice say so.
- A missing date leaves a named blank. The notice is dated with the sending date, or today.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-242 — sign-up source and referral links (6b37ed6, kunal, 12 Oct 2026)

What a user can now do:

- Arrive from a campaign link with utm\_ tags and sign up by email or Google; the account records the campaign. The tags vanish from the address bar and aren't shared with GA or anyone else.
- /login?ref=CODE opens Create account with the referral box filled in.
- Admins can see how many sign-ups came from each source.
- The privacy page says the campaign tags are kept.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-347 — impossible section numbers flagged (a75c522, shashank, 12 Oct 2026)

What a user can now do:

- See a wrong-section warning when a draft cites a section number that cannot exist, like "BNS 1034" or "Section 4521 CrPC".
- Years such as "2023" and ordinary numbers like amounts, pages or days are never flagged.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-335 — answers survive a description edit (fcc74a5, mahak, 12 Oct 2026)

What a user can now do:

- With the fact-ledger setting on: answer "Not known" to a question, then edit the description, and the answer stays "Not known" instead of the old reading coming back.
- Type or answer a detail, then edit the description, and the draft still uses what they typed.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-344 — campaign source kept through a cancelled Google sign-in (c16b5db, kunal, 12 Oct 2026)

What a user can now do:

- Arrive from a campaign link, start a Google sign-in, cancel, then try again in the same tab. The account still records which campaign brought them.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-334 — "none filed" in the advocate's own words (828d55e, mahak, 12 Oct 2026)

What a user can now do:

- Answer the earlier-bail-applications question in their own words, such as "none filed", "koi bail nahi" or "कोई नहीं", and get the draft saying no other bail application has been made, with no "earlier bail applications are: koi bail nahi" line.
- If a draft claims no earlier bail application was filed but they never confirmed it, have that claim removed or flagged before filing.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-345 + T-340 — one date format, no false "facts changed", clean category names (0d90ed7, tanvi, 12 Oct 2026)

What a user can now do:

- See every date in a template draft written like "4 April 2026", including dates of birth and custody dates.
- Type dates as numbers without a false "facts changed" warning; a real change is still flagged.
- See category names without underscores.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-351 — no free credits before an email is verified (eae46a9, shashank, 12 Oct 2026)

What a user can now do:

- Sign up with Google and get the free Ink straight away, as before.
- Sign up with an email and password and start with no free Ink until the address is verified; the daily bonus waits for that too.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-343 — accept a changed privacy policy (3cbcd78, kunal, 12 Oct 2026)

What a user can now do:

- After a privacy change, see a short notice of what changed on the next sign-in, with a link to the policy and two choices: Accept or Not now.
- After Not now, still view, download and export. A new draft or payment asks for acceptance right at the button, and anything typed is kept.
- Accept and carry on without signing in again. A dismissed notice doesn't come back in the same sign-in.
- Please also check the notice with a screen reader and with reduced motion switched on (not yet checked).

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-331 — admin template usage (d1b4372, mahak, 12 Oct 2026)

What a user can now do:

- An admin opening document analytics sees which templates are used, by name, with counts and how many were finalised, instead of an empty table.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## Run 3 result (13 Oct 2026): FAIL

Report: `handoff/quality/2026-10-13-run-3-develop-FAIL.md`. Fix tickets: T-359 to T-368. Entries that failed or were blocked stay on the list for the next run, re-tested once their fix merges.

## T-349 + T-350 — dates read naturally; bad links fail cleanly (6be8b14, tanvi, 12 Oct 2026)

What a user can now do:

- See dates in brief drafts and annexures written like "4 April 2026".
- An impossible date shows exactly as typed, not changed into another date.
- A malformed document link gives "not found".

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-354 — privacy acceptance fails safely (8e38f59, kunal, 13 Oct 2026)

What a user can now do:

- Nothing new is visible. If saving the privacy acceptance fails, the user sees the retry message and is asked to sign in again on the next action.
- Please run a real screen reader over the privacy prompt (T-343). Kunal's check was only a proxy.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-356 part 1 — describe-first for everyone (552076a, shashank, 13 Oct 2026)

What a user can now do:

- Every user, new or existing, starts a document by describing their case in their own words, without anyone having to switch it on for them.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-342 — cheque-bounce notice reads the key dates (cb8d9e5, vishal, 13 Oct 2026)

What a user can now do:

- In a cheque-bounce notice, Lawie picks up the cheque's validity date, the date the return memo was received and the date the notice is sent from the description. If the last two are missing, it asks for them, so it can check the deadlines. Nothing changes for other documents.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-223 — verify a new email account (9ae7d51, mahak, 13 Oct 2026)

What a user can now do:

- Sign up with an email and password, get a "verify your email" link, and receive the 5 free sign-up Ink once they open it.
- Ask for a new link from the banner if it didn't arrive or has expired, with a clear wait time if they ask too often.
- When they run out of Ink or try to buy Ink before verifying, see a prompt to verify instead of the payment screen.
- Sign in with Google and never see any of these prompts.
- Note for Anushka: develop runs in dry run, so no email arrives and the link can't be opened from an inbox until the founder's SES session. Test the banner, resend limit, prompts and the Google path.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-370 — "Upgrade to Pro" buys Pro (280dd3a, kunal, 13 Oct 2026)

What a user can now do:

- On Settings, see "Upgrade to Pro" with Pro's real price and monthly Ink, and pay for Pro, not the cheaper plan.
- On the dashboard, see the same Pro price on the upgrade link. A Pro user sees the plan's monthly Ink instead of "unlimited documents".
- An unverified email user still sees the verify card instead of the button.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-371 — section converter and bail checker read the signed tables (ac0eb57, shashank, 13 Oct 2026)

Re-tests run 3 failures T-250, T-275, T-296 and T-277.

What a user can now do:

- Convert an old IPC, CrPC or Evidence Act section and get the right new section, such as CrPC 362 to BNSS 403, without anyone reloading data.
- Paste a list like "Sections 420, 406 and 120B IPC" into the bulk converter and get every one converted, each with its own label.
- Look up a sub-section such as CrPC 156(3) and get BNSS 175(3).
- See "Not verified — check the Gazette" when a section cannot be confirmed, instead of "No mapping found".
- In the bail checker, type "BNS 318(4)" or "318(4)" and get the same answer. Offences whose classification is not one simple line show a short note to check the First Schedule. A section with no known maximum no longer counts as the most serious.
- Known gap: BNS 61(2) (the target of 120B) is fixed in T-383, and the 303(2) row in T-361.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-383 — criminal conspiracy shows correctly (7569b14, shashank, 13 Oct 2026)

What a user can now do:

- Look up IPC 120B or BNS 61(2) in the converter or the bail checker and see it as criminal conspiracy, not "not an offence".
- In the bail checker, see a section that isn't found named plainly ("Section 400"), not as the raw code "400-BNS".

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-372 — Ink cost and balance (587ce69, kunal, 13 Oct 2026)

Re-tests run 3 failures T-227 and T-190 ("Not known").

What a user can now do:

- See the Ink balance on the dashboard and settings instead of a "documents used" counter or a monthly allowance.
- See "Uses N Ink" under "Confirm brief and continue" before drafting, for every document type and for a draft with no type.
- See the header Ink balance drop as soon as a draft finishes.
- On the brief, press "Not known" or "None" and see it stay selected.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-374 — signed skeleton loader (1c9da98, tanvi, 13 Oct 2026)

What a user can now do:

- Nothing on screen yet. Bail drafts use the signed skeletons once T-373 lands.

Quality: nothing to test in the UI — loader only, not used until T-373

## T-367 — Timeline tracker deadlines (1706a41, shashank, 13 Oct 2026)

Re-tests run 3's timeline failures. Once T-375 merges the tracker is hidden by default, so for this run the founder switches `feature.tool_timeline` on.

What a user can now do:

- Enter the date of the first remand and see the right deadlines. For a first remand on 1 January 2026 under a 60-day offence: police custody up to 9 February, the last day for the charge sheet 1 March, and default bail from 2 March.
- See police custody explained as up to 15 days, in one go or in parts, within the first 40 or 60 days, with BNSS 187(2) and 187(3) cited.
- See every date written out, like "1 March 2026", and a countdown such as "60-day period · 12 days left".

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-379 — Email worker guard (b3d01a7, kunal, 13 Oct 2026)

What a user can now do:

- Nothing changes on screen. Before real emails are switched on, an unfinished email footer can no longer cause a verification email to go out or invalidate a link the user already has. Their email is held and sent once the footer is filled in.
- A user whose name or address contains text like "[PIN]" still gets their emails.

Quality: nothing to test in the UI — email-worker start-up and health guard

## T-365 + T-382 + T-387 — Brief picker, enrolment, pre-filing check (492426a, mahak, 13 Oct 2026)

Re-tests run 3 failures on the brief, enrolment and pre-filing check.

T-365, what a user can now do:

- Leave the advocate name empty and see their own profile name on the draft.
- Browse document types grouped by category, the same way as the templates library.
- Press "Use template" and start describing with that document already chosen.
- See a short, plain description on every document card, with no internal notes.
- On a bail application before a Magistrate, give the brief facts of the case, as in regular bail.

T-382, what a user can now do:

- Type a Bar Council enrolment number on a bail, surrender, suspension or vakalatnama form and see it printed on the draft.

T-387, what a user can now do:

- Pass the vakalatnama pre-filing check using the enrolment number saved in the profile, without typing it again.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-394 — Promoter keeps field source (5708bf3, mahak, 13 Oct 2026)

What a user can now do:

- Nothing new on screen. Section search and court pickers already work on the bail, consumer and notice forms. This keeps them working if those forms are later served from the rule packs.

Quality: nothing to test in the UI — latent: overrides already send source

## T-393 — Relation in bail drafts (3b0fdf2, kunal, 13 Oct 2026)

Re-tests run 3's "S/o for a woman" failure (T-359 AC6).

What a user can now do:

- In a bail draft, see the applicant written as son, daughter, wife or husband of exactly as given, in the verification and the cause title. A woman is never written as "S/o".
- If the relation or the name isn't known, see a clear "[To be confirmed: …]" note instead of a guess.
- Answer the new optional question "Relation to the person named below" on bail forms. The name field now reads "Name of father, mother or spouse".

Not yet: the memo of parties and the affidavit (T-396).

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-375 — v1 scope switches (bb8fd47, tanvi, 13 Oct 2026)

What a user can now do:

- Civil plaints are gone from the templates list, the brief picker and "describe your matter". They can't be opened or generated until switched on.
- The bail checker and timeline tracker are hidden from the Tools page, and their pages show "not found" until switched on.
- Existing drafts are untouched.

For this run, the founder turns on `feature.tool_timeline` (`yarn workspace @lawie/drafting seed:setting feature.tool_timeline on`; it shows within about 2 minutes), because T-367 is merged. `feature.tool_bail_checker` stays off until T-361 merges, and `feature.template_civil_plaint` stays off for v1.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-380 — Web tests typecheck (9349b6a, mahak, 13 Oct 2026)

What a user can now do:

- Nothing changes on screen. This is test files and typecheck config only.

Quality: nothing to test in the UI — test files and typecheck config only

## T-363 — s.138 notice (7f99f96, shashank, 13 Oct 2026)

Re-tests run 3's s.138 failures (T-192).

What a user can now do:

- See a warning on the brief when the notice date is more than 30 days after the return memo, and choose to continue with those dates or change them.
- Describe dates in words, such as "fifteenth September 2026", and have them filled in. Write the year with word dates, or the brief asks for it.
- Get a notice that states the real position: the offence arises if the amount isn't paid within 15 days of receiving the notice, not when the cheque is issued.
- Get a notice that keeps the proprietor and the payee's address when given, and states the return reason only as the memo gives it.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-366 — Site copy and free-tool legal lines (78318a3, tanvi, 13 Oct 2026)

Re-tests run 3's copy failures (T-317, T-306).

What a user can now do:

- Read FAQ and About pages that describe what Lawie does today: 5 free Ink once your email is verified, every document type, PDF and DOCX export, and BNS/BNSS/BSA section numbers on criminal drafts.
- See the bail checker card on the Tools page cite S.478 BNSS.
- See a home page tab title that matches the signed-in pages.
- See "once your email is verified" wherever 5 free Ink is offered.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-395 — Appellant name in suspension and appeals (a242a7f, kunal, 13 Oct 2026)

- In an application for suspension of sentence, see the verification read "I, <appellant's name>, …, aged about <age> years" instead of blanks.
- In a criminal or income-tax appeal, see the appellant's name in the cause title.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-363 fix — s.138 proprietor blanks and s.141 (d9a354c, shashank, 13 Oct 2026)

- Leave the proprietor questions blank and get a clean notice, with no "[To be confirmed …]" text in the header or the subject line.
- See s.141 cited only for a company, LLP or partnership drawer, never for an individual, HUF or unanswered drawer type.
- Pick the drawer type yourself: the form no longer pre-selects "individual".

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-385 — Template configs through one public projection (68937a7, mahak, 13 Oct 2026)

- Nothing looks different. The template list and form work as before, and civil plaint templates stay out of the list while they're switched off.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-406 — No case-number line on non-court documents (43dc53f, tanvi, 13 Oct 2026)

- Nothing changes on screen. A legal notice, deed or agreement can no longer pick up a court case-number line, whichever court is chosen.

Quality: nothing to test in the UI — latent; no current template printed the line

## T-373 — Bail drafts from signed text and your own facts (3e031ac, vishal, 13 Oct 2026)

- Draft a regular, anticipatory, Magistrate or default bail application and get only the facts you gave. Every paragraph is Lawie's signed text filled with your details, or your own words tidied for grammar. Nothing invented is added, and a gap shows as a clearly marked blank.
- See in the checks list exactly which parts are still missing, by name.
- Where the tidied wording would change what you said, see your own words used instead, exactly as typed.
- Draft these applications in Hindi as before; the draft is marked as a starting draft.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-399 — Yearly Ink monthly; cancel keeps Ink to period end (4fe03d7, kunal, 13 Oct 2026)

- On a yearly Solo or Pro plan, get your 50 or 150 Ink every month, not once a year.
- Cancel any plan and keep your Ink (on yearly, the monthly Ink too) until the end of the period you paid for.
- See the refund page say so, in Ajay's sentence.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-413 — Payments always credit Ink, never twice (9cf199e, kunal, 13 Oct 2026)

- If a top-up or plan payment goes through but the Ink isn't credited straight away, it's retried until the Ink lands, and it's never credited twice. If it still can't be credited, the team is alerted to add the Ink by hand.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-390 + T-416 — One verify email after held resends (ed2e18a, mahak, 13 Oct 2026)

- Press "resend verification email" several times before emails start going out, and get one email whose link works.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-405 — Shared public-field helper (ac78327, mahak, 13 Oct 2026)

- Nothing changes on screen (internal refactor).

Quality: nothing to test in the UI — internal refactor, output pinned unchanged

## T-410 (+ T-412, T-417, T-418) — Consumer complaint goes to a Consumer Commission (0a18bda, tanvi, 13 Oct 2026)

- In a consumer complaint, see the Commission you chose named (District, State or National).
- At a State or National Commission, see "Consumer Complaint No. **\_** of <year>".
- Open an older draft that named a non-Commission court and see "[To be confirmed: Consumer Commission]" and "[To be confirmed: place]", not a wrong court or a criminal case line.
- See the document called "Consumer Complaint", citing the 2021 Jurisdiction Rules.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-397 — Older drafting paths stop inventing relatives and conclusions (7e23038, vishal, 13 Oct 2026)

- In a cheque-bounce notice, a Hindi bail draft or any document not yet on the signed-clause path, see no "S/o" or parent's or spouse's name you didn't give; a clearly marked blank shows instead.
- See no claim that an offence is complete on its own.
- See dates kept in the format you entered.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-381 — Create annexures from a draft (9e3cafa, mahak, 13 Oct 2026)

- On a court document that names the parties, press "Create annexures" and download one PDF with the Vakalatnama, Memo of Parties and the other annexures, with the client's and the opposite party's names filled in.
- If a name or the client's side is missing, see the card say what to add, never a blank printed.
- This is the check for your T-313 and T-318.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-415 — Stuck Ink credits finish on retry (42703a4, kunal, 14 Oct 2026)

- If a payment's Ink credit gets stuck part-way, Razorpay's next retry finishes it, and it's never credited twice.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-404 part 1 — Marked blanks, not gaps (680b41c, shashank, 14 Oct 2026)

- Generate a s.138 notice without every party detail and get clearly marked "[To be confirmed: ...]" blanks to fill in, not "_____".
- See a marked blank, not an empty gap, for the advocate's name, address and enrolment number when the profile lacks them.
- Start a draft before choosing a court and see "[To be confirmed: court]", with no court name invented.
- Draft a bail application with the court, case type and place each flagged for confirmation, not guessed.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-422 — No 'offence complete' claims in bail packs, repairs, guided drafts (d2565d8, vishal, 14 Oct 2026)

- In bail packs, repair rounds and guided drafts, Lawie no longer states on its own that an offence is complete; it says so only when the brief does.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-423 — State name and accepted values on brief annexures (c9ba205, mahak, 14 Oct 2026)

- Create annexures for a bail draft made from a brief and see "State of Bihar" on the Memo of Parties, not "State of bihar".
- Party names on the annexures come only from what the brief accepted.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-396 — Memo of Parties and affidavit: relation and parties (9096c39, kunal, 14 Oct 2026)

- The Memo of Parties and the affidavit show W/o, D/o, H/o or S/o as chosen, or a clear blank, never a guessed S/o.
- The plaintiff, defendant, complainant or accused is named, with the petitioner's address and age.
- "State of …, through the concerned authority" appears only where the State is the other side, and the State is written properly.
- The Memo carries the usual Lawie footer.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)

## T-411 — Consumer Commission picker (6db7e551, tanvi, 14 Oct 2026)

- When drafting a consumer complaint, choose District, State or National Commission and see only Consumer Commissions.
- Choose NCDRC with no state.
- The field reads "Consumer Commission".
- It works by keyboard and screen reader. Other documents' court pickers are unchanged.

Quality: Anushka tests on develop before prod (founder, 8 Oct 2026)
