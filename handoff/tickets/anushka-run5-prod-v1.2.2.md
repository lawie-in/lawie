# Anushka run 5 — production v1.2.2 (29 Oct 2026)

Recorded by Arjun, verbatim from Anushka's cloud session (session_01BmgAoYMpkTNwnBnT9k1DWA; no repository in the container; headless Playwright; founder's go via Priya 09:14 UTC; founder lifted the 6-draft cap mid-run). Priya tickets the findings; nobody edits the verdict.

```
VERDICT: FAIL
Tested: https://lawie.in (prod, v1.2.2) · 29 Oct 2026, 09:18–~12:30 UTC · existing verified test account, 18 Ink at start, topped up to 62 by the Founder mid-run, 52 at end · 1280 and 390 wide

Scenarios
| # | What I did | Expected | What happened | Result |
| 1 | Declaration suit, Ramesh Kumar Verma v. Suresh Prasad Singh, Sitapur UP | Names in heading, right civil court | Names in heading. Court wrong: "IN THE COURT OF DISTRICT JUDGE, LUCKNOW" (Blocker 1). Invented facts added | Fail |
| 2 | Order 39 TI, defendant blank, then "Not known" | Asks before any draft or Ink | Asked for name; confirm locked "Add the defendant's name to continue."; no Ink spent | Pass |
| 3a | Partition, 1 defendant (Patna) | Names, no "& Ors." | Both named, "sole defendant", no & Ors. | Pass |
| 3b | Partition, 3 defendants (Ludhiana) | All defendants shown | All three listed, no wrong "& Ors." | Pass |
| 3c | Written statement (Mysuru), tried twice | A draft | Both end at a dead-end message (Blocker 5); no Ink charged | Fail |
| 3d | Replication (Hyderabad suit) | Names in heading | Names shown, key facts missing | Partial |
| 4a | Bail, Hinglish "18.10.2026 ko arrest kiya, tab se jail mein hai" | "Arrested on… and in custody" | "arrested on 18 October 2026" present; para 3 "[To be confirmed: Custody Status]" | Fail |
| 4b | Bail, surrendered and remanded | Asks custody-since | "Since what date has the applicant been in custody (the date of arrest or surrender)?" | Pass |
| 5 | PS given as "थाना Govindpura"; "Pehle koi criminal case? नहीं." | Clean PS; नहीं read as no | Both printed raw in the draft (Blocker 3) | Fail |
| 6 | Dashboard: typed "written", picked "Written statement" | Typed text kept | "written" kept | Pass |
| 7 | Ink top bar vs dashboard; low-balance message | Match | Both 52; low-balance not reached | Partial |
| 8 | PDF export + annexure download (bail) | Non-empty PDFs | 61,119 B and 114,626 B, both start "%PDF" | Pass |
| 9 | Hurried junior: skipped answers, court name given as an answer | Caught or marked blank | Declaration caught it ("Your last answer repeated the court's name…"); bail accepted the court name as "medical condition" | Partial |
| 10 | Off-library: NI Act s.138 complaint | Usable complaint | Title "Section NI Act Complaint"; given addresses dropped; out-of-time filing not flagged | Fail |
| 11 | Off-library: s.175(3) BNSS, Bihar Sharif | A draft | Court cannot be picked; Bihar CJM list = "CJM Court, Patna" only | Fail |
| 12 | Off-library: exemption s.355 BNSS (Pune) | A draft | Good draft; heading CJM, body "JMFC court" | Pass (Minor) |
| 13 | Off-library: caveat s.148A CPC (Pune) | A caveat | Heading "CAVEAT PETITION UNDER SECTION A CPC" | Fail |
| 14 | Main path at 390 wide | No sideways scroll | Width 390 throughout | Pass |
| 15 | Continue with Google | Reaches Google, back works | accounts.google.com reached; back returned to sign-in | Pass |

Findings
- Blocker 1 Court list ties the product to a few cities.
  - UP: "District Court" lists only "District Court, Lucknow"; no Civil Judge court type. A Sitapur suit went out "IN THE COURT OF DISTRICT JUDGE, LUCKNOW".
  - Telangana: no Hyderabad court. Bihar CJM: Patna only (Nalanda s.175(3) impossible).
  - Kerala district courts leave out Ernakulam and Thiruvananthapuram. Rajasthan: "Jaipur Rural" but no Jaipur.
  - Steps: New document → civil suit in Sitapur → brief → Uttar Pradesh → District Court.
- Blocker 2 Declaration plaint adds facts I never gave, in a pleading verified on oath: para 8 "the plaintiff did not receive any consideration for the said sale deed"; para 9 "the plaintiff did not appear before the Sub-Registrar".
- Blocker 3 Bail draft pastes Hinglish raw: "6. The criminal antecedents of the applicant are: Pehle koi criminal case? नहीं."; "11. ek chhota bachcha hai depend on the applicant."; "9. As to recovery: Koi recovery nahi hui"; "Police Station थाना Govindpura" in para 2 and the prayer. Release item 5 not met.
- Blocker 4 Section numbers stripped: "CAVEAT PETITION UNDER SECTION A CPC" (148A lost); "Section NI Act Complaint For Dishonoured Cheque" (138 lost). Wrong law on the face of the document.
- Blocker 5 Written statement cannot be made. Two runs both end: "The draft gives 15.06.2025 as the Date of service of summons on defendant, but your facts give it as the Additional pleas / facts not pleaded by plaintiff but defendant relies on (Order VIII R.2). Which is right?" Facts gave summons served 05.10.2026 and repayment 15.06.2025; the brief showed "5 October 2026". Only exit: "Back to the brief". No Ink charged.
- Major Party names not read from descriptions that name them (declaration, both partitions: "Needed to continue"). One declaration run pre-filled the defendant as "Court of Civil Judge (Junior Division), Sitapur", marked only "Please check".
- Major Given facts dropped and turned into blanks:
  - Valuations Rs 3,00,000 / 40,00,000 / 30,00,000 all became "[To be confirmed: valuation…]".
  - Addresses dropped in the declaration suit and the NI Act complaint.
  - Replication omits the quit notice of 02.07.2026, the AD of 06.07.2026 and "no rent since March 2026".
- Major Bail: custody status left blank despite "tab se jail mein hai"; heading "UNDER [TO BE CONFIRMED: SECTION 439 OF THE CRPC OR SECTION 483 OF THE BNSS]" for an Oct-2026 FIR where only BNSS 483 applies.
- Major Replication out of order: affidavit before the prayer, two verifications; para 5 "The [To be confirmed: Plaintiff full name] response…"; prayer "Reject the Written Statement".
- Major NI Act complaint: notice served 23.08.2026, so the complaint was due by about 08.10.2026; no limitation warning, no s.142 jurisdiction pleading, prayer mixes repealed CrPC with BNSS.
- Major About 7–8 minutes from first word to draft, every time.
- Minor:
  - Dashboard: "injunction" and "partition" give "No template matches." though the TI template exists.
  - Internal codes on screen: "up_district_lucknow", "mp_sessions_bhopal".
  - TI date 20.10.2026 can only be marked "Date of the title document" or "Not needed".
  - WS brief says "extendable to 120 in non-commercial" (wrong: 120 days is the commercial limit; in ordinary suits the 90-day limit is directory).
  - Date boxes show mm/dd/yyyy (may be my browser's setting).
  - Custody-since asked again when the arrest date was given.
  - Exemption heading CJM while body says JMFC.
- Works: asks before assuming (bail type, missing defendant); failed drafts use no Ink; PDF warns about blanks before export; exemption application is good.

Not tested:
- Low-balance Ink message: balance always above the draft cost.
- "Edit my description" / going back mid-flow; DOCX export.
- Payments and signup free Ink (out of scope).
- s.175(3) BNSS draft (blocked by the court list).
- Draft count: 9 generated plus 2 failed WS attempts, over the 6 cap; the Founder allowed it mid-run ("Dont worry about budget, I will add more ink").
- No code or repository opened.
- I am not an enrolled advocate; the limitation and WS time-limit points need a practising advocate to confirm.

Would I use this on a real matter today? No: wrong courts, invented facts, raw Hinglish and missing section numbers reach drafts that would be filed.
```

## Arjun's note (29 Oct 2026)

Release items 2, 3a/3b, 4b, 6, 8 pass; 1 (court heading), 4a (custody), 5 (Hinglish/PS) fail; 3c (written statement) is a dead end. Blocker 5 (delivery-gate dead end on WS) and Blocker 3 (Hinglish passthrough, T-611 territory) read as regressions of this release — P1 for Priya. Blocker 1 is the courts catalogue and needs Ajay's list, not a code guess. Chrome/PDF on prod is confirmed working by item 8.

# Anushka run 5b — production v1.2.3, headline T-668 re-check (29 Oct 2026, 12:03–12:50 UTC)

Verbatim from session_01BmgAoYMpkTNwnBnT9k1DWA; scope = T-668 headline + 2-min smoke; 2 drafts.

```
VERDICT: FAIL
Tested: https://lawie.in (prod, v1.2.3) · 29 Oct 2026, 12:03–~12:50 UTC · same test account, 52 Ink at start, 48 at end · 1280 wide

Scenarios
| # | What I did | Expected | What happened | Result |
| 1 | Declaration plaint (Gorakhpur), "Defendant: Not known (a person claiming through a forged sale deed…)"; brief defendant left "Not known" | Asks for the name; no Ink | No question. Brief shows only "Please check"; Confirm enabled ("Uses 2 Ink"). Draft made, 2 Ink spent (52 to 50). Heading "[To be confirmed: name and address of the Defendant]", not "Not known" | Fail |
| 2 | Eviction (Ranchi), tenant's name empty | Asks | Form asks "What is the tenant's full name?" and again in round 2; brief "Add the name of the the person or authority it is against or addressed to to continue." | Pass |
| 3 | Eviction, "Not known" typed in brief defendant box | Blocked | Same line, Confirm disabled | Pass |
| 4 | Eviction, "Not known" typed in the form's tenant-name question | Asks again; blocked before Ink | "The tenant's name is still missing. Should the draft leave a blank for it to be filled in later?"; brief still blocks | Pass (Minor) |
| 5 | Partition (Durg), defendants "Ramesh Sahu and Not known" | Blocked | Blocked, Confirm disabled | Pass |
| 6 | Written statement (Aligarh), plaintiff "Not known" | Blocked | "Add the name of the plaintiff to continue." Confirm disabled | Pass |
| 7 | Replication (Kolkata), defendant "not known" | Blocked | Confirm disabled, "Choose the court and add the parties to continue." (no Kolkata court picked, so court also missing) | Pass (likely) |
| 8 | Smoke: sign in, regular bail (Mumbai), PDF export | Draft + real PDF | Signed in; draft "Section 483 of the BNSS"; PDF 50,093 B, starts "%PDF"; 2 Ink | Pass (Major below) |

Findings
- Major Declaration plaint with "Not known" defendant is drafted and charged.
  - Screen: defendant box "Not known" ("Please check"), no "to continue" line, "Uses 2 Ink", Confirm enabled.
  - After draft: "The draft does not contain the person or authority it is addressed to as given in the brief: "Not known". Check that the name is written correctly."
  - Steps: New document → "Suit for declaration… Defendant: Not known (…)" → skip questions → choose court → Confirm.
  - Why: the exact case this release promises to stop; the user pays for a draft with no defendant. "Not known" did not print in heading or verification.
- Major (carried over from v1.2.2) Bail drops custody facts: description "Arrested on 10.10.2026 and in judicial custody since then"; para 3 "The applicant has been in judicial custody since [To be confirmed: in custody since]".
- Minor:
  - "Add the name of the the person…" (doubled "the").
  - Form offers "leave a blank for it to be filled in later", then the brief refuses a blank.
  - Bail heading/address "THE HONOURABLE SESSIONS FOR GREATER BOMBAY AT MUMBAI" ("Court"/"Judge" missing).
  - The known generic "Something did not work"/Retry did not appear in my runs.

Not tested: specific performance and recovery plaints (WS covered a recovery suit from the defendant's side); the injunction plaint itself (TI application tested in v1.2.2); phone width (not asked). Drafts used: 2 of 3.

Would I use this on a real matter today? No: one common civil plaint still lets "Not known" through and charges for it, and the bail draft still drops custody facts I gave.
```

Arjun: T-668 passes 6/7; the miss is "Not known (…)" with a parenthetical — exact-match non-answer check. T-668b leads v1.2.4; T-665 re-opened as T-665b (custody still blank).
