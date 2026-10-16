# Quality run 4 — the product on develop — FAIL

- **By:** Anushka (CQO), from the founder's chat, with four helper agents in their own tabs. She wrote the verdict alone.
- **When:** Fri 16 Oct 2026, about 13:50 to 14:25 IST.
- **Build:** `develop` as running on the founder's Mac on 16 Oct 2026, with everything built since the 13 Oct build.
- **Where:** the founder's Chrome, through the Claude extension, at 1470 px desktop width only.
- **Account:** "Adv. Abhi", Free plan. It started at 14 Ink; the founder added Ink from the database to bring it to 50, and it ended at 31.
- **What she was sent:** five items to test, the known issue T-471, a request for cost notes, and the founder's extra request to try a draft that probably has no template.
- **Not done:**
  - Billing: the founder is setting up Razorpay test mode first.
  - PDF and DOCX downloads: no permission.
  - Phone width.

## Overall: FAIL

The bail drafts are clearly better than on 13 Oct. No facts were invented in any bail draft, and no date was wrong in any of the 11 drafts. But:

- **Revision petition:** it tells the court a petition filed 131 days after the order is within the 90-day limit, and that no condonation is needed.
- **Fixes not in the drafts:** two of the promised writ fixes are missing:
  - The habeas citation is "S.35 BNSS", not "S.35(1)(b) BNSS [S.41(1)(b) CrPC]".
  - The certiorari never says "inferior tribunal or quasi-judicial authority".
- **Plain labels:** the forms still show raw labels such as "known_state_custody".
- **Password reset:** there is no way to reach it. The sign-in page has no link, and `/forgot-password` and `/reset-password` return 404.
- **T-471:** the director of a company drawer is not made a noticee, and the s.141 paragraph is vague.

## Items

### 1. Bail, revision and writ drafts: FAIL

- **No judgment names: PASS, with one caveat.** No case is named in any of the 11 drafts. "[Authority — add if relied upon]" appears where a case would be cited: habeas paras 2, 9(d) and 14; mandamus 11(g); certiorari 9 and 11; quashing 8 and 10; revision; both bail drafts; the caveat. The caveat: quashing para 9 quotes the seven quashing categories word for word, in quotation marks, without saying where they come from.
- **Plain labels: FAIL.** Options appear as raw identifiers:
  - Habeas: "known_state_custody", "police_custody_beyond_24_hours_without_remand", "yes_grounds_not_served".
  - Quashing: "category_1_no_offence_disclosed" … "category_7_mala_fide_vendetta", "stay_coercive_steps".
  - Revision: "refusal_to_discharge", "framing_of_charge", "interlocutory_no_revision".
  - Maintenance: "divorced_wife_not_remarried".
  - Court type, everywhere: "consumer_commission" and "tribunal".
  - Document headers: "patna_hc", "bihar_sessions_gaya", "jharkhand_cjm_ranchi".
  - The mandamus labels are plain.
- **Earlier drafts still open: PASS.** The 13 Oct regular bail opens with its text unchanged and a new "Create annexures" button. Regenerating an old draft from its saved answers was not tested.
- **Habeas, "S.35(1)(b) BNSS [S.41(1)(b) CrPC]": FAIL.** Checked myself. Para 9(b) reads only "the conditions on arrest by the police under S.35 BNSS"; there is no sub-clause and no CrPC reference.
  - The cause title is blank on both sides ("**\_** … Petitioner VERSUS **\_** … Respondents"), although the names were given.
  - The heading and para 13 cite "Article 226 / Article 32" in a High Court petition.
  - "Shri/Smt." and "his/her" are left in.
- **Mandamus, conditions in plain words: PASS.** Locus standi, statutory duty, legal right, demand, inaction and alternative remedy each have a plain paragraph. But there is no cause title at all, and the title reads "ART. 226/32".
- **Certiorari opening "inferior tribunal or quasi-judicial authority": FAIL.** Checked myself; the phrase is absent.
  - The draft opens "WRIT PETITION — CERTIORARI (ARTICLE 226/32) / TO, THE HON'BLE HIGH COURT… MOST RESPECTFULLY SHOWETH:" before the court heading and cause title.
  - The State of Jharkhand is not made a respondent.
- **Criminal revision (Sessions, Prayagraj): FAIL (Blocker).**
  - Para 7: "the revision is filed within the period of 90 days… counted from the order dated 11 June 2026… The date recorded for limitation compliance is 20/10/26. No application for condonation of delay under Section 5 of the Limitation Act, 1963 is required." The filing is 131 days after the order.
  - The cause title is blank, although the names were given.
  - The title cites S.442, which is the High Court's power, on a Sessions petition.
  - A High Court can be picked as the court for a Sessions revision with no warning.
- **Quashing under S.528 BNSS (settled matrimonial FIR): FAIL.**
  - No compromise ground is offered, so the draft argues the seven merits categories.
  - The cause title is blank.
  - The prayer adds reliefs that were not chosen.
  - The court text says "The BRIEF records…".

### 2. Dates: PASS

No wrong or swapped date in any of the 11 drafts, including deliberately confusable pairs:

- 12.10.2026 / 10.12.2025
- 02/11/2025 / 11/02/2026
- 07.08.2019 / 08.07.2026
- 03.12.2018 / 12.03.2019
- 11.06.2026 / 06.11.2025
- 02.08 / 12.08 / 14.08 / 18.08 / 05.09.2026

Dates not given came out as "[To be confirmed: …]" blanks (date of FIR, first remand, date of application).

Minor:

- Mandamus copied "5/6/25" exactly as typed, without flagging it as ambiguous.
- The revision kept "20/10/26" in raw form.
- The checks panel still falsely says given dates are "not in your brief" (10 December 2025, 30 June 2024, 7 August 2019, 2 March 2025).

### 3. Model: draft bodies better, intake worse

**Regular bail, same facts as 13 Oct (mine): better body, worse intake.**

- **Better:**
  - The invented ground "already undergone prolonged custody" is gone.
  - All three of my grounds now appear, including the civil-dispute ground that was dropped on 13 Oct.
  - No invented "roots" or "good character".
  - The complainant's allegation is now stated.
- **Worse:**
  - The governing law is left as "[To be confirmed: Section 439 of the CrPC or Section 483 of the BNSS]", in the title, para 2 and the prayer. I had chosen "BNSS and BSA" on the brief, and the arrest was on 20 Sep 2026.
  - Para 14 contradicts itself: "the brief records "None". [To be confirmed: whether any earlier bail application was made…]".
  - Para 7 says "[To be confirmed: grounds]" and then lists the grounds.
- **Intake re-asked seven facts already in the description:** name, FIR number, sections, police station, custody, father's name, age.
- **The brief no longer read** the address, the antecedents ("never been accused") or the dependants ("elderly mother aged 72"); all were read on 13 Oct.
- **Unchanged:** the duplicate "318(4)" is still not removed, and there are false checks ("2 March 2025 not in your brief", "72 years" flagged as a period).

**Anticipatory bail (helper, Gaya): better.**

- No roots, no "no history of fleeing", and "business dispute" is gone. It is correctly called a boundary dispute.
- The earlier-applications part is a correct blank, and the undertakings are correctly worded.
- 2 of its 4 check findings are still false (antecedents, brief facts).

**Default bail (helper, Ranchi): better, but one bug.**

- The invented "not convicted / roots" text is gone, and the checks are clean.
- The bond undertaking still prints: "11. That the applicant undertakes to furnish bail bonds…". The "No" button on the bail-bonds question cannot be selected, in the questions or on the brief (tried 3 times).
- The earlier rejection given in the description was not carried into the brief.

**Overall:** the drafting is better and safer. Intake is weaker: it asks again for what was written, and misses facts it used to read.

### 4. Billing: BLOCKED

- Subscribing needs a State saved on the account first ("We use this to issue GST tax invoices"). The founder will set up Razorpay test mode before this is run.
- Seen without paying: Settings now shows "Upgrade to Pro — ₹1,999/month, ✓ 150 Ink/month", matching the pricing page (on 13 Oct it said ₹799 and unlimited). The dashboard now says "You have 14 Ink" instead of "8 of 5 documents".
- Not tested:
  - Lapsed re-subscribe.
  - Double click giving one charge.
  - "Try again" on a cancel failure.
  - Yearly plan credits.

### 5. Reset emails and account pages: FAIL

- **Password reset:** I could not find any way to start a password reset.
  - The sign-in page has no "Forgot password" link, even after a failed sign-in ("Email or password is incorrect. Signed up with Google? Use Continue with Google above.").
  - `/forgot-password` and `/reset-password` both return "404 This page could not be found."
  - A lawyer who forgets the password has no way back in.
- **Account pages: PASS.** Settings (profile, plan, State, invoices "No invoices yet", Close account) loads. Sign-in error messages still work. The founder's session was unaffected.

### Known issue T-471, s.138 notice with a company drawer: FAIL

- Drawer "M/s Shree Balaji Infratech Pvt. Ltd." through director Anil Kedia, cheque 118204 for Rs 7,45,000.
- The company is named as drawer and noticee, and the brief has a "Drawer Type: Company / LLP" choice.
- There is no field for the director or signatory, and no question about s.141. The notice is addressed to the company only. The director appears once, as signatory ("signed and issued on your behalf by your director, Mr. Anil Kedia").
- Para 11 is vague: "your liability and that of the persons responsible for the conduct of your business will be pursued in accordance with Sections 141 and 142".
- Para 10 leaks an internal note into the notice: "the bank memo reference number is not stated in the instructions to me".
- All dates are exact, and the notice is within 30 days of the memo being received.

### Founder's extra request: a matter with no template

**Caveat under s.148A CPC, Civil Judge (Senior Division), Patna: FAIL.**

- It does not refuse: it falls back to a generic brief ("No Lawie rules for this one") and asks sensible, specific questions.
- But:
  - The section I named is lost. The title reads "Caveat under Section A CPC", and the body "CAVEAT UNDER [Section — verify before filing]".
  - The advocate's name, enrolment and chamber, given in the questions, are all blanks.
  - The brief put the court ("Civil Judge (Senior Division), Patna") in as the party the caveat is against.
  - The caveator and the relief were left blank on the brief although given.
  - It never says that a copy was served on the expected plaintiff, which s.148A(2) requires.
  - It lists unfillable blanks ("the actual wording of any suit … since none exists yet").
  - The checks report "no mismatch".
  - The first click on Confirm did nothing.
- Good: dates are correct, there are no invented facts, and the facts are pleaded in order.

**Maintenance under S.144 BNSS, Gaya (helper): FAIL.**

- "Wife ke liye maintenance … Bihar … Gaya" got "We could not find a ready document for this. That happens with less common requests." This is one of the commonest filings.
- After naming "Section 144 BNSS before Family Court, Gaya", the court list has no Family Court, and District, JMFC and CJM each offer only Patna. Abandoned, with no Ink spent.

### Other findings across the run

- **Major:** blank cause titles although the names were given (habeas, quashing, revision, regular bail case number). The mandamus has no cause title at all.
- **Major:** "Article 226/32" in High Court writ headings.
- **Major:** the checks panel still gives false findings, and the blank counts don't match the text (e.g. "5 blanks", 2 visible).
- **Minor:** text typed within a few seconds of opening New document is wiped silently (seen several times). The first click on "Confirm brief and continue" after editing a field does nothing (seen 4 times).
- **Minor:** the checklists and checks ask for a "Disclaimer slip — Lawie drafting assistance acknowledged" to be filed in court.
- **Minor:** product words in court text ("the brief records", "no material in the brief").
- **Improvement:** "Uses 2 Ink" now shows before Confirm.

## Cost notes

Times are IST on Fri 16 Oct 2026. The first two helpers had no clock, so their rows give the order of drafts only. No draft had an AI revision step; only a manual editor exists, so revisions are 0 throughout. Ink was shared across parallel tabs.

| #   | Flow                                       | Start             | Finish            | Revisions | Ink before → after | Note                             |
| --- | ------------------------------------------ | ----------------- | ----------------- | --------- | ------------------ | -------------------------------- |
| 1   | Legal notice s.138 NI Act (company drawer) | time not recorded | time not recorded | 0         | 50 → 49            | "Uses 1 Ink"                     |
| 2   | Habeas corpus, Patna HC                    | ≈ first           | ≈ +4 min          | 0         | 50 → 47            | overlaps #1                      |
| 3   | Criminal revision, Sessions Prayagraj      | not recorded      | not recorded      | 0         | 47 → 45            |                                  |
| 4   | Writ of mandamus, Allahabad HC Lucknow     | ≈ +5 min          | ≈ +9 min          | 0         | 47 → 43            | overlaps #3                      |
| 5   | Maintenance S.144 BNSS, Gaya               | not recorded      | not recorded      | 0         | 43 → 43            | abandoned at court choice, 0 Ink |
| 6   | Writ of certiorari, Jharkhand HC           | ≈ +10 min         | ≈ +18 min         | 0         | 43 → 41            |                                  |
| 7   | FIR quashing S.528 BNSS, Delhi HC          | ≈ +19 min         | ≈ +23 min         | 0         | 41 → 39            |                                  |
| 8   | Anticipatory bail, Gaya                    | 14:16:52          | 14:20:44          | 0         | 39 → 35            | overlaps #9                      |
| 9   | Regular bail, Patna                        | 14:17:19          | 14:20:17          | 0         | 39 → 35            | overlaps #8; "Uses 2 Ink"        |
| 10  | Caveat s.148A CPC, Patna (no template)     | 14:20:43          | 14:23:43          | 0         | 35 → 31            | overlaps #11; "Uses 2 Ink"       |
| 11  | Default bail, CJM Ranchi                   | 14:20:44          | 14:24:15          | 0         | 35 → 31            | overlaps #10                     |

Eleven drafts generated and one abandoned. Ink went from 50 to 31, a total of 19. That is consistent with 1 for the s.138 notice and 2 for each of the other nine.

## Test data left in the account

Eleven new drafts dated 16 Oct 2026, all with made-up names and facts. Nothing was deleted, exported, bought or subscribed.

## Screenshots

- Sign-in page, no reset link (my tab): `…/tool-results/mcp-claude-in-chrome-blob-1792137801891-lrv8jn.jpg`
- Caveat with no template, "Section A CPC": `…/tool-results/mcp-claude-in-chrome-blob-1792140833846-aaqicc.jpg`
- Anticipatory bail: `…/tool-results/mcp-claude-in-chrome-blob-1792140636524-fyu01o.jpg`
- Default bail: `…/tool-results/mcp-claude-in-chrome-blob-1792140851499-rmkd2i.jpg`
- Habeas: `…/tool-results/mcp-claude-in-chrome-blob-1792137993795-5ukuah.jpg`
- Certiorari: `…/tool-results/mcp-claude-in-chrome-blob-1792138557165-fe0e9w.jpg`
- Revision, limitation para 7: `…/tool-results/mcp-claude-in-chrome-blob-1792138221427-18xdxa.jpg`
- s.138 company drawer brief: `…/tool-results/mcp-claude-in-chrome-blob-1792137842403-9yobsd.jpg`

All of these are under `/Users/apple/.claude/projects/-Users-apple-files-Repos-lawie/ec443205-4785-4e89-8c9d-61a82b4420ae/`.

`Quality: FAIL — Anushka, Fri 16 Oct 2026, 14:25 IST.` Main reasons:

- The revision draft claims a time-barred petition is within limitation.
- The promised habeas and certiorari fixes are not in the drafts.
- Raw labels remain in the forms.
- Password reset cannot be reached.
- T-471 is still open.
- Billing has not yet been tested.
