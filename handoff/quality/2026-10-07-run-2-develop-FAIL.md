# Quality run 2 — the product on develop — FAIL

- **By:** Anushka (CQO), run as her own agent from the war-room chat.
- **When:** 7 Oct 2026, about 22:52 to 23:26 IST.
- **Build:** `develop` at `f48a4fc` (PR #51 merged), as running on the founder's Mac.
- **Where:** the founder's Chrome, through the Claude extension, in a tab of her own.
- **What she was sent:** seventeen things a user should be able to do today, the address, the account state, and a limit of 4 generated drafts. Payment and export were excluded.
- **The founder's instruction to her, word for word:** "Categorize your findings in terms of Ready for going live or not. Do not mark something blocker if it can be ignored for now. We can have such ticket for improvements but right now we want to go live as soon as possible"
- **This file is her report, word for word.** Nothing is summarised or removed.

## Her notes before the report

WHAT I REACHED AND WHAT I DID NOT

- Reached: http://localhost:3000 through the founder's Chrome, in a tab of my own (now closed; the founder's tab was not touched). Signed in as "Advocate Abhi", Free plan. Dashboard, New document, brief, draft editor, My documents, Templates, Section finder, and the public home, pricing and FAQ pages.
- Not reached / not done: PDF and DOCX export (not allowed this run), Settings, sign-in/sign-out, any payment step. I closed the "Ink insufficient" dialog twice without choosing a path.
- Drafts generated: 4 of 4 allowed. Ink went 5 -> 3 -> 2 -> 1 -> 0.
- Build-side material in what I was sent: the repository's CLAUDE.md (layout, stack, commands) was in my context. I did not use it.
- For the record (worth saving): Ink actually charged per draft today: Regular Bail 2, s.138 notice 1, Bail before Magistrate 1, Rent Agreement 1. The app quoted 2 Ink for Anticipatory Bail and for Consumer Complaint. Account now: Ink 0, dashboard reads "You have 0 documents remaining this month" and "6 of 5 documents used". Four new test drafts are in the account; the Lucknow bail draft carries my test words "(QA edit one)" on the case-number line. Nothing deleted, exported or bought.

## Her report

```
VERDICT: FAIL
Tested: http://localhost:3000 · 7 Oct 2026, evening · Advocate Abhi, Free plan, Ink 5 at start and 0 at end, 4 drafts generated · 1470 px desktop and 500 px (the narrowest the browser window would go; I asked for 390)

Scenarios
| # | What I did, as an advocate | What a lawyer expects | What happened | Result |
| 1 | Opened the dashboard to see what I have left | One true figure | "You have 3 documents remaining this month", "2 of 5 documents used", header "5 Ink". Two measures that later disagreed (see 12) | Fail |
| 2 | Typed "Need bail application for my client Ramesh Yadav. FIR 212/2026 PS Hazratganj Lucknow under section 318(4) BNS." No arrest stated | Asked: regular or anticipatory | Labelled "REGULAR BAIL APPLICATION" without asking. Asked custody; I chose "No — anticipating arrest"; it stayed "Regular Bail Application" to the brief, no warning. Stopped at brief | Fail |
| 3 | Changed my mind: "Edit my description", rewrote as a full regular bail matter (in judicial custody since 13 Sept, CJM rejected bail 22 Sept), Sessions Court Lucknow. Generated (draft 1) | Clean s.483 application with my facts only | s.483 correct; CJM rejection stated; no "first application" claim; no custody length. But "Plaintiff (civil) / Applicant (criminal)" printed 5 times, and facts I never gave. Brief still held my old answer "No — anticipating arrest" beside "In custody since 13/09/2026" until I corrected it | Fail |
| 4 | Typed "(QA edit one)" into draft 1, reloaded | Edit kept | Kept; "Saved" shown | Pass |
| 5 | Hinglish cheque bounce: "3 lakh ka cheque", "date 1 sept 2026", "return memo pichle hafte aaya". Skipped the questions that re-asked what I had said. Generated (draft 2) | s.138 notice, my amount and dates, blank for the unknown memo date, one demand | Right document, not for a court, English output, one demand of 15 days from receipt for the cheque amount only. Amount came out as "[To be confirmed: cheque amount (rs.)]"; "Rajesh Traders" gone; two facts changed | Fail |
| 6 | Hinglish "agrim zamanat chahiye, Sessions court Ranchi", to the brief | Anticipatory bail; only Sessions or High Court offered | Right document. Court types offered: Chief Judicial Magistrate, JMFC, "consumer_commission", "tribunal", District Court, High Court, Sessions Court. Typed "Koderma": empty list, "Needed to continue", Confirm greyed out | Fail |
| 7 | Rent agreement from the dashboard card, Hinglish, Patna. Generated (draft 4) | No court asked; my terms; one clean deed | No court asked ("Not for a court"); one clean deed; amounts, 11 months, start date, 1 month notice right. Fathers' names, "5 tarikh tak" and "sirf rehne ke liye" lost; "Floor: 3B" invented | Fail |
| 8 | Consumer complaint, fridge, Jaipur, to confirm | Only consumer commissions offered; cost told before spend | Offered Chief Judicial Magistrate, Sessions Court, High Court as well. On confirm: "You need 2 Ink to draft this document." Closed it; nothing charged, brief kept | Fail |
| 9 | At phone width: Hinglish bail matter for "CJM Patna ke court me". Generated (draft 3) | s.480 application headed for CJM Patna with my client's name | Right document and s.480. Heading "IN THE COURT OF _____", applicant's name blank in title, prayer and verification. 15 checks in developer words. Case law added on its own | Fail |
| 10 | Opened drafts 2 and 3 at phone width | Read the draft | Draft is a strip one line high, or not visible; the screen is Filing checklist, Sections cited, Document info | Fail |
| 11 | My documents: found and opened the 6 Oct Dhanbad draft | Earlier drafts listed and open | Listed and opened. Court column shows "up_sessions_lucknow", "jharkhand_sessions_dhanbad" | Pass |
| 12 | Read the balance before and after every draft | Cost told before spending; balance right after | Cost never shown before a draft I could afford. Header balance stale after 3 of 4 drafts until I changed page. Dashboard said "0 documents remaining" and I then made another | Fail |
| 13 | Typed "notice bhejna hai tenant ko" | Asked which notice | Taken as "LEGAL NOTICE — EVICTION / QUIT NOTICE (STATE RENT ACT / TPA S.106)" without asking | Fail |
| 14 | Read home, pricing, FAQ | Only what the product does | Several statements untrue (finding 8) | Fail |
| 15 | Templates list; Section finder "439 CrPC" | Correct provisions | 439 CrPC -> 483 BNSS correct. Three template descriptions cite provisions I believe are wrong (Can wait, last item) | Part |

Findings

MUST BE FIXED BEFORE GOING LIVE

1. Bail before Magistrate comes out without its court, its applicant or its verification.
- Saw: "IN THE COURT OF _____"; "_____ ... Applicant/Accused"; "TO, THE HON'BLE _____,"; prayer "Release the applicant _____ on bail"; "I, _____, S/o _____, aged about _____ years, currently in judicial custody at _____ ... paragraphs 1 to _____"; "Place: _____". I had chosen "CJM Court, Patna" and given name, father, age and jail.
- The result page said: "15 checks did not pass" and lines like: Unfilled placeholder "{courtDesignation}" in section "cause_title". Please provide this field or it will appear as a blank in the document. There is no such field for me to provide. It also said "5 blanks to fill"; I count 19.
- Steps: New document -> a bail matter that names a CJM court -> Bihar, Chief Judicial Magistrate, CJM Court, Patna -> confirm.
- Cannot wait: a lawyer pays 1 Ink for a bail application with no court and no client in the heading, and cannot finish it without rebuilding it by hand.

2. Drafts state facts I never gave and drop or change facts I did give, while the brief says "Your description is used in full, together with this brief."
- Added, regular bail: "has no criminal antecedents. He is gainfully employed ... He has cooperated with the police during investigation"; "has family and social connections in Lucknow". I did not select "No prior criminal record" and gave no job.
- Added, Magistrate bail: "He is a long-standing resident of Patna with family ties to the locality."
- Changed, s.138 notice: I wrote "return memo pichle hafte aaya"; draft says memo received "in the week following the presentation". I gave Karol Bagh as the branch the cheque was drawn on; draft says my client "presented the said cheque for encashment on 15.09.2026 at HDFC Bank, Karol Bagh".
- Dropped: "3 lakh" (amount blank five times), "Rajesh Traders ke malik", "PS Pirbahore" (police station blank), both fathers' names in the rent agreement, "sirf rehne ke liye".
- Changed, rent agreement: "har mahine ki 5 tarikh tak" became "shall make payment within 5 days of the due date"; "(d) Floor: 3B" (3B is the flat number).
- The checks caught none of the added or changed facts.
- Cannot wait: "no criminal antecedents" in a verified bail application, and a wrong memo date in a s.138 notice (limitation runs from it), are the lawyer's facts misstated to a court and to the other side.

3. Case law is put into a bail application on its own, and I believe it is wrongly relied on.
- Saw, Magistrate bail para 5: "Applying the well-established triple-test laid down in Sushila Aggarwal v. State (NCT of Delhi) (2020) 5 SCC 1 and P. Chidambaram v. Directorate of Enforcement (2019) 9 SCC 24".
- As I read them, both are anticipatory-bail rulings and neither is the source of the triple test. A practising advocate must confirm. I gave no judgment, and nothing on the result page says a citation was added.
- Cannot wait: a junior who files this misleads the court on authority.

4. Regular bail prints the template's party labels into the court document.
- Saw: "... Plaintiff (civil) / Applicant (criminal)" and "... Defendant (civil) / Opposite Party (criminal)" in the cause title; "Grant Regular Bail to the Plaintiff (civil) / Applicant (criminal), Ramesh Yadav"; again in the verification and under the signature. Also "State of U.P. through the District Magistrate / S.P., Lucknow".
- Cannot wait: it is in the heading of the main document and goes to the registry unless hand-corrected in five places.

5. Money and balance: what I am told and what happens do not match.
- No cost is shown before a draft I can afford; "Confirm brief and continue" starts the draft. The cost appears only when I am short: "You need 2 Ink to draft this document."
- Pricing page: "Each document you generate uses 1 Ink" and "Less than ₹16 per document on Solo". Regular bail took 2 Ink (5 -> 3); anticipatory bail and consumer complaint were quoted at 2.
- Dashboard said "You have 0 documents remaining this month" with 1 Ink left; I then generated a rent agreement. It now reads "6 of 5 documents used".
- Header balance stayed at the old figure after drafts 2, 3 and 4 until I changed page.
- Dashboard button "Upgrade to Pro — ₹799/mo"; pricing page says Solo is ₹799 and Pro is ₹1,999.
- Public pages say "5 Ink (lifetime)"; dashboard says "this month"; the dialog says "log in tomorrow for free Ink — daily login bonus resets at midnight".
- Cannot wait: a user is charged double the published price without being told, and cannot tell what he has left.

6. An advocate whose court is not in the list cannot make a court document.
- Sessions courts listed: Uttar Pradesh 10, Bihar 11, Jharkhand 10. Bihar has one CJM court ("CJM Court, Patna"). Madhya Pradesh has 55.
- Typing "Koderma" gives an empty list, no message, no way to enter a court; "Choose the court to continue." and Confirm stays greyed out.
- Cannot wait: it stops most district advocates in the three launch states from finishing a bail application.

7. The brief keeps an old answer that contradicts the new description, and a regular bail can proceed for a client who is not in custody.
- After I rewrote the description to say "in judicial custody ... since 13 Sept 2026", the brief still had "No — anticipating arrest" selected, with "In custody since 13/09/2026" beside it, and no "Please check" mark.
- In scenario 2 the same answer sat under "Regular Bail Application" with no warning.
- Not generated in that state, so I cannot say what the draft would read.
- Cannot wait: the wrong custody status, or the wrong kind of bail application, goes to draft and is paid for.

8. Public pages say things the product does not do.
- "Draft court-ready legal documents in under 5 minutes." and footer "Court-ready legal drafting"; every draft is headed "Starting draft — review before use · not court-verified", and the FAQ says Lawie "does not certify any document as court-approved".
- Home and FAQ list "cheque bounce complaints"; I found only the s.138 notice among the 92 documents.
- "Each document you generate uses 1 Ink." (finding 5).
- FAQ: "Does Lawie work on mobile? Yes. The site and the drafting flow work on modern mobile browsers"; the draft cannot be read at phone width (scenario 10).
- FAQ: "District and High Courts across Bihar, Jharkhand, UP, and Delhi" (finding 6).
- New document page: "ask only for what is missing"; the police station was asked for in 5 of 5 criminal matters that named it, and cheque date, cheque amount, purchase date and start date were asked for after I gave them.
- Cannot wait: these are untrue statements about the product to the people being asked to pay.

CAN WAIT: IMPROVEMENT AFTER GOING LIVE

- Guesses instead of asking which document: "bail application" -> regular bail; "notice bhejna hai tenant ko" -> eviction notice. The choice is named on screen before any spend and can be changed. This is the same kind of fault as the first run; the founder may want it moved up.
- Phone-width draft screen itself can wait only if the FAQ sentence in finding 8 no longer claims it. The "SECTION FINDER" tab also overlaps cards and fields at that width.
- Court type is not narrowed to the document: bail offered "consumer_commission", "tribunal" (ITAT, DRT, NCLT); anticipatory bail offered Magistrates; consumer complaint offered Sessions Court. "consumer_commission" and "tribunal" are shown as raw labels.
- "Judicial Magistrate First Class" is offered only for Bihar and Jharkhand; "Civil Court (Senior Division)" only for Bihar.
- State list contains "India" and "Union Territory of Andaman and Nicobar Islands" as well as "Andaman and Nicobar Islands".
- Raw codes on screen: "up_sessions_lucknow", "bihar_cjm_patna" under the draft title, in Document info and in My documents; Type "Petition" for a bail application; "rent_agreement.json" in a template description.
- Checks after the draft raise false alarms: dates I gave flagged as "not in your brief"; "We could not find ... Sections Charged in FIR" when para 1 has them; "does not contain the applicant name "Mohan Prasad"" when it does; "does not cover: Witnesses" when the block is there. I am not told what was checked when nothing is flagged.
- No place in any bail brief for earlier or pending bail applications. The drafts stay silent (they never claim to be the first), so the advocate must add the line.
- Regular bail: verification by an applicant in jail "Verified at Lucknow"; checklist omits the copy of the CJM's rejection order; "Lucknow, Lucknow" in the address. Local practice: a practising advocate should confirm.
- s.138 notice: "By Registered Post A.D. / Speed Post / UPC" (I believe UPC is discontinued; confirm); "within 30 days thereafter" where the Act says one month; no "legally enforceable debt" wording; client's address appears only in para 15.
- Rent agreement: rent escalation "every twelve months" in an 11-month term; "Landlord PAN" and "Tenant PAN" marked Required; insurance, property tax and forfeiture terms nobody asked for.
- Advocate's name is "Abhi" in one draft and "[To be confirmed: advocate name]" in another.
- New draft opens at "v2"; every autosave raises the version.
- Dashboard cards (Rent agreement, Consumer complaint) open the same page with a bail example and no sign of what I picked.
- Court "Type to narrow the list" text survives a change of state and hides courts with no message. The state I picked for one matter stayed after I rewrote the description for another.
- Odd questions: "How many days have passed since the purchase on 5 July 2026 until now?", "Amount in Words", "Annual Escalation (%)" for 11 months.
- Pricing: Pro lists the same three extras as Solo. Editor says "Upgrade to Pro for clean exports". Home's three steps say "Name the document and choose your state and court".
- Twice, text typed within about 2 seconds of opening New document did not appear. Possibly my tool; a human should try.
- Template descriptions I believe cite wrong provisions, for Ajay or a practising advocate to confirm; none was drafted: "S.442 BNSS (Sessions)" for revision, "S.413 BNSS (criminal HC)" for review, "S.272 BNSS (summons case)" for discharge.

Not tested: PDF and DOCX export and the watermark (not allowed). Settings, sign-in, sign-out, top-up, upgrade (not allowed). A draft of anticipatory bail, consumer complaint, or regular bail in the "No — anticipating arrest" state (Ink ran out; seen to the brief only). 86 of the 92 document types. High Court and JMFC headings. A true 390 px phone (the window stopped at 500 px). Hindi output. Whether the "daily login bonus" exists. Sample PDFs on the home page (downloads). How a registry in any state receives these formats.
Would I use this on a real matter today? No: two of the four drafts came out unusable or with facts I never gave, one cited case law I would not stand behind, and I was charged without being told the price.
```
