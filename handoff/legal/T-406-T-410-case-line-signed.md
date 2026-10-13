# T-406 and T-410: case-number line on documents (Ajay, CLO, 13 Oct 2026)

| Ticket | Question                                                                          | Ruling                                                                                                                                                                                                                                                                                                                                                                                               |
| ------ | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-406  | Scope of the guard: A (all 32 `not_court_documents`) or B (`legal_notice_*` only) | **A.** A notice, deed, agreement or rent agreement is not filed in court, so none of them prints a case-number line or a court nomenclature. Same root cause, one guard, on the signed `not_court_documents` list.                                                                                                                                                                                   |
| T-406  | The 39 golden entries that move (26 notice, 13 rent_agreement)                    | I sign them as one batch. Each change must only remove the case-number line, with no other byte moved. Send me the snapshot diff.                                                                                                                                                                                                                                                                    |
| T-410  | consumer_complaint at a court that is not a Consumer Commission                   | **Consumer Commission only.** The court picker for this pack offers only the District, State and National Commissions. If an older draft still carries another court, print `[To be confirmed: Consumer Commission]` in place of the court and the case line. Never a criminal or bail case line, and never a guessed Commission. Generation is not blocked: the blank shows up in the checks panel. |

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

## T-410 build: golden batch and calls (13 Oct 2026)

**Golden batch: signed.** 12 entries, consumer_complaint at the 12 non-Commission courts Tanvi listed. Every change follows Addendum 1:

- `case_nomenclature`, `court_designation` and `court_header` become `[To be confirmed: Consumer Commission]`.
- Party labels become Complainant / Opposite Party.
- Prayer opening and closing come from the consumer rule.
- `state_respondent` becomes `undefined`.
- The verification is the consumer text, with `Verified at [To be confirmed: place]`.

No other entry moves. Any other byte change needs a new sign-off.

| #   | Call                                                                                  | Ruling                                                                                          |
| --- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1   | State Commission designation from the court record's own text (some include the city) | Approved, if every record names the State Consumer Disputes Redressal Commission of that State. |
| 2   | Act-only heading at a non-Commission court                                            | Approved. The forum is unknown, so no section is cited.                                         |
| 3   | Place: the Commission's city, else `[To be confirmed: place]`                         | Approved                                                                                        |

**Out-of-scope items:**

- **`related_acts` "21 Dec 2021": fix in T-410 now** (same file). Use the T-412 Rules name. Widen the T-412 test to catch every form of the date ("21 Dec", "21.12.2021", "21/12/2021"), not just "21 December 2021".
- **AI prompt receiving a non-Commission court's party designations: fix in T-410 now.** Ruling 4 covers the Drafter input too. The prompt gets Complainant / Opposite Party only. Test: no "State of" or "S.H.O." in the prompt.
- **`display_name` "Consumer Complaint (District Commission)", and `description` "Section 35 … before District Commission": new ticket.** They should not name a level now that all three Commissions are offered. Wording comes to me.
- **`ncdrc.json` :13 and :52 say "exceeding Rs. 10 Crore": new ticket, high priority.** That is the Act's original figure. The National Commission's pecuniary jurisdiction under the 2021 Rules (T-412) is above Rs. 2 crore. Signed text for both lines: replace `exceeding Rs. 10 Crore` with `exceeding Rs. 2 Crore (per the Consumer Protection (Jurisdiction of the District Commission, the State Commission and the National Commission) Rules, 2021)`. Also check the state commission records for the old Rs. 1 crore / Rs. 10 crore band.

## T-418: consumer_complaint display_name and description (signed 13 Oct 2026)

- `display_name`: `Consumer Complaint`
- `description`: `Consumer complaint under the Consumer Protection Act, 2019, before the District, State or National Consumer Disputes Redressal Commission`

Neither names one level or cites s.35, because the section depends on the forum (T-410 Addendum 1). The card line from T-365 stays as signed. Tanvi may fold this into T-410.

## T-410 / T-417: Tanvi's wording questions (13 Oct 2026)

1. **ncdrc.json :52: signed as:** `Pecuniary jurisdiction: NCDRC hears complaints where value exceeds Rs. 2 Crore (per the Consumer Protection (Jurisdiction of the District Commission, the State Commission and the National Commission) Rules, 2021).` :13 stays as signed. The State Commission audit is clean (36 of 36 records show Rs. 50 lakh to 2 crore).
2. **Prompt opening, signed:** replace `for a Consumer Complaint under Section 35 of the Consumer Protection Act, 2019` with `for a Consumer Complaint under the Consumer Protection Act, 2019`. The rest of the prompt is unchanged, including the s.2 definition references in Para 7.
3. **District localRules in the prompt: fix in T-410.** It belongs with ruling 4 and the party-designation fix. The generic consumer rule's District-worded localRules (the Rs. 50 lakh line, the District fee) go to the prompt only when the forum is a District Commission. A State Commission gets its own rule's lines. A non-Commission court gets none. Test: the State and non-Commission prompts contain no "District Commission".

**Item 3 amended: (a).** A State Commission gets no localRules for now, because all 36 point to the District-worded generic rule. Its pecuniary band comes from its own court record (Rs. 50 lakh to Rs. 2 crore, already audited). Signed State fee lines would need verified fee figures, so that waits for a separate ticket if it is ever wanted. The test stays: no "District Commission" in the State or non-Commission prompts.

**Test scope (item 3).** The RELATED ACTS line is exempt from the no-"District Commission" test, because it names all three bands and the Rules in full, which is correct for every forum. The test must also check that this line is byte-equal to the signed related_acts text, so nothing else can hide in it.
