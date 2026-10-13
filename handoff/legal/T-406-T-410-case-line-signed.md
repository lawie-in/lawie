# T-406 and T-410: case-number line on documents (Ajay, CLO, 13 Oct 2026)

| Ticket | Question | Ruling |
|---|---|---|
| T-406 | Scope of the guard: A (all 32 `not_court_documents`) or B (`legal_notice_*` only) | **A.** A notice, deed, agreement or rent agreement is not filed in court, so none of them prints a case-number line or a court nomenclature. Same root cause, one guard, on the signed `not_court_documents` list. |
| T-406 | The 39 golden entries that move (26 notice, 13 rent_agreement) | I sign them as one batch. Each change must only remove the case-number line, with no other byte moved. Send me the snapshot diff. |
| T-410 | consumer_complaint at a court that is not a Consumer Commission | **Consumer Commission only.** The court picker for this pack offers only the District, State and National Commissions. If an older draft still carries another court, print `[To be confirmed: Consumer Commission]` in place of the court and the case line. Never a criminal or bail case line, and never a guessed Commission. Generation is not blocked: the blank shows up in the checks panel. |

Tests:
- T-406: every `not_court_documents` pack, at any court, prints no case-number line.
- T-410: consumer_complaint with a non-consumer court gives the blank, with no "Bail", "Crl." or "Criminal" in the cause title.

## T-406 golden batch: signed (13 Oct 2026)

Tanvi's batch: 39 entries, 13 courts × {legal_notice_s138, legal_notice_s80, rent_agreement}. The one change in each entry: the `case_nomenclature` line is removed and left unset. No other key changes, and no court-document entry changes. I checked against the current snapshot (`court-rules-golden.test.ts.snap`): it has 78 `case_nomenclature` lines, and every removed string Tanvi lists appears there.

Signed, on this condition: after regeneration the snapshot diff is removals only, exactly 39 `-` lines and no `+` lines, and 39 `case_nomenclature` lines remain. Any other byte change means a new sign-off.

**Amended condition (13 Oct 2026), replacing the one above.** Jest keeps the key and serialises it as `undefined`. The signed form is: exactly 39 lines change, each from `"case_nomenclature": "<court line>",` to `"case_nomenclature": undefined,`, in the 39 non-court entries Tanvi listed. No other byte changes. 78 `case_nomenclature` lines remain: 39 court-document values unchanged and 39 `undefined`. Signed. Same meaning: no case line prints.

## T-410 Addendum 1 (13 Oct 2026): consumer_complaint text and rulings (Tanvi's four questions)

**1. Cause title and addressing clause: yes, use the tokens.** Set `court_levels` to `["consumer_commission"]` (drop `district_court`).

`docs/templates/consumer_complaint.json` cause_title (:262). Everything from `IN THE MATTER OF:` on stays byte-identical:
```
{court_header}\n\n{case_nomenclature}\n\nIN THE MATTER OF:\n\n{applicant_name}\nS/o / W/o {father_name}\nAge: {applicant_age} years\nR/o {address}\n                                              ... Complainant\n\nVersus\n\n{respondent_name}\n                                              ... Opposite Party
```
addressing_clause (:274):
```
TO,\nTHE HONOURABLE PRESIDENT AND MEMBERS,\n{court_designation},\n{court_city}\n\nMOST RESPECTFULLY SHOWETH:
```
At a court that is not a Commission: `{court_header}`, `{case_nomenclature}` and `{court_designation}` each print `[To be confirmed: Consumer Commission]`. The `{court_city}` line is left out, so the addressing clause never names a city the advocate did not choose for a Commission.

**2. The 36 State Commissions.** "First Appeal No." is an appeal line and is wrong for a complaint. "DISTRICT" is wrong for a State Commission. For consumer_complaint at a State Commission:
- designation and header: `STATE CONSUMER DISPUTES REDRESSAL COMMISSION` with the State from the court record
- case line: `Consumer Complaint No. _____ of {current_year}`

The State Commission rule's appeal line stays for appeal packs.

**3. NCDRC.** Which registration line the National Commission uses for an original complaint is **verify**. Until it is verified, print `Consumer Complaint No. _____ of {current_year}`. The registry assigns the number, so a descriptive line is safe.

**4. Not a Commission: consumer rule only.** Party labels (Complainant / Opposite Party), prayer and verification always come from the consumer pack, never from the court's rule. No "State of …" respondent and no criminal-court wording.

**Also: complaint_heading.** "UNDER SECTION 35" is the District Commission provision. At a State or National Commission, the section the complaint is filed under is **verify**. Until it is verified, the heading prints `CONSUMER COMPLAINT UNDER THE CONSUMER PROTECTION ACT, 2019` at State and National, and the s.35 line only at District.

**Logged for review (not T-410):** the body prompt's pecuniary note cites a "Notification dated 21 December 2021". The date is **verify**. Priya, please log it as its own ticket for me.

Tests:
- State Commission: no "First Appeal" and no "DISTRICT".
- Non-Commission court: three blanks, no city, no "State of".
- District: s.35 heading.
- State and National: the Act-only heading.
