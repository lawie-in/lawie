# Quality check: drafting on lawie.in (production): FAIL

- **By:** Anushka (CQO), from the founder's chat. I wrote the verdict myself.
- **When:** Mon 26 Oct 2026, about 21:48 to 22:21 IST, when Lawie signed the account out (see item 8). Part 2 ran from 22:23 to 22:30 IST, after the founder signed in again.
- **Build:** lawie.in as live on 26 Oct 2026, after the founder said the "Could not read your description" fix was deployed.
- **Where:** the founder's Chrome, through the Claude extension, at desktop width (1470 px, later 1280 px).
- **Account:** "Anand Test", Free plan.
  - Ink went from 28 to 20: five drafts, costing 2 + 1 + 1 + 2 + 2.
  - The dashboard showed each drop as it happened.
  - No Ink was granted from admin.
- **Client details:** all made up.
- **Not done:**
  - PDF and DOCX downloads: no permission was given, so I didn't click them.
  - Phone width: the browser window would not shrink below 1280 px. This was my end, not a Lawie fault.
  - The 4,000-character limit.

## Overall: FAIL

Drafting works again on lawie.in. Four drafts were made, each in about 30 seconds, with one click on Confirm. Ink was charged exactly as the page said. But:

- **Regular bail can't be started by describing the matter.**
  - Three tries gave "We could not find a ready document for this". One try was 657 characters; two were one line.
  - Regular bail is our main document.
  - It works only from Templates.
  - Anticipatory bail, the s.138 notice and the Order 39 injunction were all recognised from a description.
- **Raw `{{MISSING: …}}` text is printed in three of the four drafts.** Worse, several of these are facts I had given and that the brief showed as filled:
  - the amount in words;
  - the sale deed date (shown four times);
  - the relief in the main suit;
  - the applicant's address.
- **In both regular and anticipatory bail, grounds picked in the questions are lost, and the grounds buttons on the brief do nothing.** Neither bail draft argues a single ground; each prints `{{MISSING: Grounds for Bail}}`.
- **The injunction prayer restrains the defendant from digging "on 20 October 2026",** a date already past. The cause title leaves both parties blank.
- **The session ended after about 30–35 minutes.** Lawie sent me to sign in midway through a new draft.
- **Admin money and audit records are still wrong:**
  - the Ink ledger records none of the drafts' spending;
  - AI cost shows ₹0 for 38,248 tokens;
  - the audit log shows 0 events.

## Items

### 1. Regular bail, full facts (Templates → Regular Bail Application): FAIL

- **Input:** the 657-character matter. Ramesh Kumar Yadav (34), FIR 412/2026 dated 17 Oct 2026, Kadamkuan PS Patna, BNS 318(4) and 316(2). ₹2,40,000 taken for a shop lease, ₹1,00,000 returned, no antecedents, sole earner for a family of five, chargesheet not filed, ready to give sureties. The magistrate refused bail on 21 Oct 2026.
- **From description: FAIL.** "We could not find a ready document for this." No Ink was taken.
- **Questions (2 rounds, about 35 s to the first):**
  - I answered: Male; the ground "No prior criminal record"; judicial custody; father Shri Mahesh Prasad Yadav; a made-up address; under investigation; named in the FIR: Yes; recovery: None.
  - The grounds list has nothing for a civil dispute, money returned, sole earner or sureties.
  - It asked about the medical condition a second time, even though its own words said "leave it blank".
- **Brief:**
  - The court was correct: District & Sessions Court, Patna.
  - Name, father, age, address, police station, FIR number and date, sections, arrest date, custody and earlier bail refusal were all carried over correctly.
  - "Brief facts" left out the ₹1,00,000 already returned.
  - **The ground I picked in round 1 was gone.** The brief showed "To be asked".
  - **Clicking a ground on the brief did nothing.** I clicked twice.
  - "Answer 2 questions" asked for the grounds again. I picked the ground again, and **it was lost again**.
  - I confirmed anyway, after putting my grounds in "Anything else".
- **Confirm:** one click worked. The draft took about 35 s and cost 2 Ink, as shown.
- **The draft:**
  - The heading, s.483 BNSS, parties, FIR details, undertaking, prayer and verification are correct.
  - **Para 3:** `{{MISSING: in custody since}}`, although the arrest date (18 Oct) was in the brief.
  - **Para 8:** `{{MISSING: Grounds for Bail}}`.
  - **No ground is argued.** Para 9 is my own sentence pasted in. Paras 11–12 repeat it: "The applicant is the only earning member of the family." "family of five depend on the applicant."
  - **Para 2:** "Police Station Kadamkuan Police Station". This was also found on 16 Oct.
  - "[To be confirmed: relation]" appears before "Shri Mahesh Prasad Yadav (father)".
  - The court shows as "bihar_sessions_patna" in the header, in My documents and in Document info.
- **Blanks:** the page says 4 and I count 4. Two of them are `{{MISSING}}`, not `[To be confirmed]`.

### 2. Editing and saving: PASS, with one gap

- I replaced the relation blank with "S/o" and filled para 3 with "18 October 2026".
- It showed "Saved", the version went from v1 to v3, and both edits were still there after reloading.
- My documents lists the draft. The dashboard counts changed correctly.
- **There is no Finalise in the editor.** Finalise is offered only on the screen right after a draft is made.

### 3. Cheque bounce notice, s.138 NI Act (from description): FAIL

- **Input:**
  - M/s Shree Ganesh Traders through proprietor Vijay Kumar Sinha, against Rakesh Mishra.
  - Cheque 004512 dated 1 Oct 2026, ₹3,50,000, SBI Boring Road.
  - Presented 15 Oct; returned "Funds Insufficient" with memo dated 20 Oct; memo received 22 Oct; notice to go on 27 Oct.
  - My first try asked for a s.138 **complaint**. There is no complaint template, so it said "could not find". That message was correct, but "less common requests" is the wrong reason.
- **Recognised from description: PASS.**
- It asked for the State, although I had written Patna.
- **Brief: PASS.** The amount in words was filled in as "Rupees Three Lakh Fifty Thousand only". Partner and director fields were shown although the drawer is an individual.
- **The draft (1 Ink, about 30 s):**
  - Good: the structure, s.138 read with s.142, the 30-day and 15-day periods, every date, and the checklist, including the one-month complaint window.
  - **`{{MISSING: Amount in Words}}` appears three times,** although the brief had it filled.
  - **Para 6:** "presented … on `{{MISSING: Cheque Date}}`", while para 10 says it was presented on 15 Oct.
  - **"Rs. Rs 3,50,000"** appears in the subject line and in the demand.
  - **The checks panel is wrong twice:**
    - It says "Missing part: Cheque Details", but para 4 lists them.
    - It flags "thirty days" as not in the brief, but that is the statutory period.

### 4. Temporary injunction, Order 39 rules 1–2 CPC (from description): FAIL

- **Input:**
  - Title Suit 245/2026, Sunita Devi against Manoj Kumar Singh.
  - 5 decimals of land, Plot 112, Khata 45, Mauza Digha.
  - Registered sale deed dated 12 March 2019.
  - The defendant began digging a foundation on 20 Oct 2026.
  - Ex parte relief asked for.
- The questions were the right legal ones: prima facie case, balance of convenience, irreparable injury, the R.3 proviso, and the undertaking.
- **The court list has no Civil Judge (Junior Division) or Munsif.** I had to choose "Civil Court (Senior Division)".
- **The State list here differs from the bail one.** It includes "India" and lists Andaman twice.
- **The draft (1 Ink, 31 s):**
  - Good: the three limbs are argued from my answers. The R.3 ex parte paragraph, undertaking, prayer and checklist are correct.
  - **The cause title leaves both parties blank** ("_____ … Plaintiff"), although para 1 names them.
  - It reads **"Civil Suit No. ___"**, although I gave Title Suit No. 245 of 2026, which para 1 uses.
  - **The sale deed date is `{{MISSING: date}}` four times.** I gave it twice. The checks panel itself says the brief has 12 March 2019 and the draft doesn't use it.
  - **`{{MISSING: relief sought in the main suit}}`.** I wrote "declaration and permanent injunction".
  - **Prayer (a) restrains the defendant "from digging a foundation … on 20 October 2026",** a past date. It should restrain any construction on the suit land.
  - The checks panel says "Missing part: Prima Facie Case", but para 8 is exactly that.
  - It is labelled as a "Petition".
- **Blanks:** the page says 12.

### 5. A document with no template: vehicle release on superdari before the CJM: PASS, with faults

- **Honest:** it says "No Lawie rules for this one". It drafted from my description and **did not invent a section**; it left "[Provision of law … verify before filing]". For reference, the section finder correctly maps s.451 CrPC to s.497 BNSS.
- **The brief named the court ("Chief Judicial Magistrate, Patna") as the opposite party.** I changed it to the State of Bihar.
- "The person the document is for" and "What is asked for" were empty, although both were in my description.
- One blank reads "[To be confirmed: a detail we could not find in your words]", which tells the lawyer nothing.
- **The address I gave in round 1 is missing** from the draft ("[To be confirmed: address of the applicant]").
- The advocate's name and enrolment number are blank, although the account has them.
- 2 Ink, 30 s, 9 blanks.

### 6. Awkward inputs (no Ink spent): PASS, with one FAIL

- **Empty box:** Continue is disabled. PASS.
- **"Regular bail" (12 characters):** "A little more, please: at least 20 characters." PASS.
- **Gibberish:** "could not find a ready document", no Ink taken. PASS.
- **"Write a poem…":** turned away, no Ink taken. PASS.
- **Dashboard box with 657 characters: FAIL.** The box holds all of it, but **only 499 characters reach the New document page**, with no warning. The sole-earner, chargesheet, sureties and magistrate's-refusal facts are dropped. The box also suggested "Bail application" but opened the general page.
- **Text lost on page load: unconfirmed.** Text I typed several times right after the New document page loaded didn't appear. At least once the cause was my browser not having focus, so I am not calling it a Lawie fault.

### 7. Top up (just looking): PASS, with one point

- The prices match the pricing page: 3 Ink ₹65, 10 Ink ₹199, 28 Ink ₹499.
- **The GST State is pre-set to "Delhi".** A Patna advocate who doesn't change it gets an invoice for the wrong State.
- I closed it without buying.

### 8. Session: FAIL

- The founder signed in at about 21:48. At about 22:20, opening New document sent me to the sign-in page, so the session lasted about 30–35 minutes.
- My click landed on "Continue with Google". I did not choose any account and went back to the sign-in page.

### 9. Admin cross-check (read-only): FAIL

- **Correct:**
  - Documents shows 4.
  - Recent activity lists all 4 drafts.
  - Overview "Ink in circulation" is 33, which matches Users (22 + 11).
- **Ink ledger:** it still shows 16 in circulation, "Spent –0" and no entries for the 6 Ink spent. The "last 5 min" telemetry still shows events from this morning.
- **AI configuration:** "Total cost ₹0" for 4 generations and 38,248 tokens.
- **Audit log:** still "0 events".
- **Users:** "Last active" shows "—" for an account in use.
- **Dashboard "Drafts by type":** shows 3 of the 4 drafts (the injunction is missing). One shows as "Guided", an internal label.

### 10. Section finder: PASS

- 498A IPC → BNS 85; 438 CrPC → BNSS 482; 451 CrPC → BNSS 497. All correct.
- Searching by topic ("anticipatory bail") finds nothing; it searches by section number only.

## Timings

| Draft | Ink | Confirm → draft ready |
|---|---|---|
| Regular bail | 2 | about 35 s |
| s.138 notice | 1 | about 30 s |
| O.39 injunction | 1 | 31 s |
| Vehicle release (no template) | 2 | 30 s |

From description to questions: about 30–35 s each time.

## Part 2, after the founder signed in again (22:23 to 22:30 IST)

Ink went from 22 to 20.

### 11. Anticipatory bail (from description): FAIL

- **Input:**
  - Pankaj Singh (29), S/o Ramesh Singh, Rajendra Nagar, Patna.
  - The wife's FIR 77/2026 dated 12 Oct 2026, Mahila PS Patna, under s.85 BNS and ss.3–4 of the Dowry Prohibition Act.
  - Married on 5 Feb 2023; she left on 14 June 2026.
  - The allegations are general, with no date or incident.
  - Not yet arrested, no antecedents, a teacher, will cooperate.
- **Recognised from description: PASS.** The questions suited the case: earlier bail applications, why arrest is feared, grounds, and stage of investigation.
- **I picked four grounds:** no prior record, will cooperate, deep roots, and reputation ruined by arrest.
  - **All four were gone on the brief,** which showed "To be asked". This is the same fault as in regular bail, so it affects both bail types.
  - **Clicking a ground on the brief did nothing,** as in regular bail.
- **The draft (2 Ink, 30 s):**
  - Correctly under **s.482 BNSS**.
  - The undertaking follows the s.482(2) conditions.
  - The prayer includes immediate release if arrested.
  - **Para 6 is `{{MISSING: Grounds for Anticipatory Bail (select all applicable)}}`.** Nothing is argued. The draft is eight short paragraphs.
  - It leaves out the marriage date, that she left in June, and that the allegations name no date or incident. Only my one-line "why arrest is feared" answer is used.
  - **"Police Station Mahila Police Station"** (para 2).
  - "himself or herself", although "Male" was chosen.
- **Blanks:** the page says 2.

### 12. Hindi: FAIL

- The first click on हिन्दी did nothing. The second worked.
- **Only the home page changes**, and only partly: "Documents", "Prices", "FAQ" and "Sign in" stay in English.
- The dashboard and New document stay entirely in English.
- While signed in, the home page still shows "Sign in" and "Start with 5 free Ink".
- I switched the site back to English afterwards.

### Admin after part 2

The dashboard's "Drafts by type" shows bail 2, guided 1, legal notice 1: four of five. The injunction is still left out.

## Still not done

- Downloads: no permission was given.
- Phone width: I need a different browser window.
- The 4,000-character limit.
