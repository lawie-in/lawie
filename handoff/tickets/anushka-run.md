# For Anushka's next run on develop

Priya collects each lead's "What a user can now do" text here after a merge into `develop_staging`. Anushka gets only this text, the address, the account state and the draft allowance (`.claude/docs/quality-gate.md`). It reaches `develop` when the founder merges `develop_staging`.

## Setup before the run (Priya, 12 Oct 2026)

- `feature.describe_first`: on for the signed-in account (founder checked, 12 Oct).
- `feature.fact_ledger`: not set in the database today, so it is off. Before Anushka tests T-189, once T-189 is on `develop`, the founder adds the app setting `feature.fact_ledger` with the same value as `feature.describe_first` (his user id, or the comma-separated list of ids). Never `on`: that would switch it on for every user, and it stays off for real users until T-187, T-188, T-190 and T-194 are done.

- For default bail (T-251): `feature.fact_ledger` must also be ON for her test account, or the default bail template isn't offered.

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
