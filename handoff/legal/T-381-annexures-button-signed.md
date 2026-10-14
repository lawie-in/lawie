# T-381: Vakalatnama and Memo of Parties button (Ajay, CLO, 13 Oct 2026)

Source: `handoff/marketing/copy/annexures-button-t381.md` (Madhuri, 13 Oct). The rows below are signed word for word.

| Key                          | String                                  | Ruling                                         |
| ---------------------------- | --------------------------------------- | ---------------------------------------------- |
| `annex.button`               | Create Vakalatnama and Memo of Parties  | Approved. Use this, not the "Get …" alternate. |
| `annex.button_help`          | Prepared from the details you entered.  | Approved                                       |
| `annex.success_title`        | Vakalatnama and Memo of Parties created | Approved                                       |
| `annex.success_note`         | Check both before filing.               | Approved                                       |
| `annex.download_vakalatnama` | Download Vakalatnama                    | Approved                                       |
| `annex.download_memo`        | Download Memo of Parties                | Approved                                       |

The rows marked "No legal statement" need no sign-off, as long as they stay as drafted.

**T-194 blanks dialog: applies.** Every export of either annexure goes through the same blanks check as any other export: the header, the highlights and the dialog. The pack can carry signed blanks, such as the opposite party (T-404 vakalatnama row) and the advocate's enrolment number (T-404 Addendum 3). Test: an annexure with a `[To be confirmed: …]` gets the T-194 header and dialog.

**Disclaimer.** No banner by the buttons. Each file carries the T-317 Addendum 4 annexure footer: `Draft prepared by Lawie from the details you entered. Check it before filing. Lawie does not provide legal advice.` The annexures are filled from a template, so neither file may say "generated with AI".

**Open items (Priya):**

- If the pack costs Ink, the cost must show before the click (T-238 conditional line), and a failed pack is not charged. Those strings come to me.
- The "already created" state has no legal statement, so it needs no sign-off.

## Addendum 1: party-role mapping (Mahak's proposal, 13 Oct 2026)

**Blocker: no priority chain for the client.** A "first non-empty" list guesses who the advocate acts for, and guesses wrong in real packs:

- In a complaint pack, `accused_name` comes before `complainant_name`, so the accused would sign the complainant's Vakalatnama.
- In a written statement, reply or counter for the defendant or respondent, `plaintiff_name` or `petitioner_name` would become the client.

**Rule.** The client side comes from what the advocate stated, in this order:

1. `client_role`, when answered (the T-404 vakalatnama A row).
2. Otherwise, the pack's declared client role: a per-pack table with one fixed role per pack (bail → accused/applicant; complaint → complainant; appeal → appellant; suit → plaintiff; written statement → defendant; and so on). The table comes to me for sign-off.
3. Otherwise, the signed blanks. Never a guess.

The opposite side is the counterpart of that role, from the matching `<role>_name` field. If that is empty, the signed blank.

| Item                          | Ruling                                                                                                                                                                                                                                                |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Address, age and parentage    | Only from the matching `<role>_address`, `<role>_age` and `<role>_father_name`. The generic `address`, `age` and `father_name` may fill the **client** side only, and only when the pack's table says they are the client's. Never the opposite side. |
| Bail: "State" as respondent   | Keep. The State is the opposite party in a bail application. The State's name comes from the court's State. If that is unknown: `[To be confirmed: State]`.                                                                                           |
| Advocate name and enrolment   | The T-311 resolver: typed first; otherwise the profile, and the profile enrolment only when the printed name came from the profile; otherwise the T-404 blanks.                                                                                       |
| Court labels from brief.court | Approved                                                                                                                                                                                                                                              |

Tests:

- A complaint pack with both names gives the complainant as the client.
- A written statement gives the defendant as the client.
- With no role and no table entry, the blanks print.

## Addendum 2 (13 Oct 2026): single PDF of 7 annexures

These replace the six signed rows above. The Vakalatnama and Memo of Parties strings drop.

| Key                   | String                                                          | Ruling             |
| --------------------- | --------------------------------------------------------------- | ------------------ |
| `annex.button`        | Create annexures                                                | Signed             |
| `annex.button_help`   | Prepared from the details you entered.                          | Signed (unchanged) |
| `annex.success_title` | Annexures created                                               | Signed             |
| `annex.success_note`  | Check each annexure and fill in every blank line before filing. | Signed             |
| `annex.download`      | Download annexures (PDF)                                        | Signed             |

No string names the seven annexures or says they are complete.

**Blanks check: v1 may ship without the T-194 preflight**, on three conditions:

1. The route refuses to print when the client's name or the opposite party's name is missing, and the card shows the signed `annex.missing_*` state. A party name never prints as `___________`.
2. Underscore lines remain only for what is filled by hand: signatures, dates, the registry number, and details the brief does not hold. The success note above tells the advocate to fill them in.
3. Priya logs a follow-up ticket for the server-side blanks check, so the pack gets the T-194 header and dialog.

**Annexure A footer.** Agreed: it goes in T-396 (Kunal) as the T-317 Addendum 4 footer, word for word, and I sign it there.

## Addendum 3 (13 Oct 2026): per-pack client-role table, signed

Mahak's table: 60 court packs. Rule 1 always wins: an answered `client_role` overrides this table. Client details come only from the matching `<role>_address`, `_age` and `_father_name` or `_parentage`. The generic `address` and `father_name` fill the client only in bail_regular, bail_anticipatory and consumer_complaint.

| Packs                                                                                                                             | Client field                          | Counterpart                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------- |
| bail_regular, bail_anticipatory, bail_before_magistrate, default_bail, interim_bail, surrender_application, discharge_application | applicant_name (the accused)          | State (Addendum 1 State rule)                                                 |
| suspension_of_sentence                                                                                                            | appellant_name (convict)              | State                                                                         |
| amendment_of_pleadings, condonation_of_delay, production_of_documents, receiver_appointment, maintenance_bnss_144                 | applicant_name                        | respondent_name                                                               |
| interim_application                                                                                                               | applicant_name                        | non_applicant_name                                                            |
| cat_oa                                                                                                                            | applicant_name                        | blank                                                                         |
| ibc_application                                                                                                                   | applicant_name                        | corporate_debtor_name                                                         |
| dv_act_complaint                                                                                                                  | aggrieved_name                        | respondent_name                                                               |
| divorce_hma, divorce_sma, judicial_separation, rcr_petition, guardianship_petition, curative_petition, criminal_revision          | petitioner_name                       | respondent_name                                                               |
| certiorari, mandamus                                                                                                              | petitioner_name                       | respondent_authority                                                          |
| writ_petition_civil, writ_petition_criminal, review_petition, slp, habeas_corpus, pil, quo_warranto                               | petitioner_name                       | blank                                                                         |
| fir_quashing, quashing_528_bnss                                                                                                   | petitioner_name (the accused)         | complainant_name, and State                                                   |
| bail_cancellation                                                                                                                 | petitioner_name                       | respondent_name. **Flip** ("Accused (for variation of conditions)") → blanks. |
| criminal_appeal, itat_appeal                                                                                                      | appellant_name                        | respondent_name                                                               |
| consumer_complaint                                                                                                                | applicant_name (Complainant)          | respondent_name (Opposite Party)                                              |
| posh_complaint                                                                                                                    | complainant_name                      | respondent_name                                                               |
| rera_complaint                                                                                                                    | complainant_name                      | promoter_name. **Flip** (promoter_against_allottee) → blanks.                 |
| mact_claim                                                                                                                        | victim_name (claimant)                | owner_name / insurer_name. **Death claim** (claimants_list) → blanks.         |
| plaint_declaration, plaint_eviction, plaint_injunction, plaint_recovery, plaint_specific_performance, temporary_injunction_o39    | plaintiff_name                        | defendant_name                                                                |
| plaint_partition, replication                                                                                                     | plaintiff_name                        | blank                                                                         |
| restoration_application                                                                                                           | parties.plaintiff_name                | parties.defendant_name                                                        |
| written_statement                                                                                                                 | defendant_name                        | blank                                                                         |
| counter_affidavit                                                                                                                 | parties.respondent_name               | parties.petitioner_name                                                       |
| rejoinder_affidavit                                                                                                               | parties.petitioner_name               | parties.respondent_name                                                       |
| vakalatnama                                                                                                                       | client_name, role from client_role    | blank                                                                         |
| affidavit_in_support, divorce_mutual_consent, list_of_dates, synopsis, memo_of_parties                                            | blanks unless client_role is answered | blanks                                                                        |

**The three caveat rows: signed as Mahak proposed.** When the flip option or a death claim is chosen, print blanks. Never swap the sides automatically.

A pack added later has no row until I sign one, so it prints blanks.

Tests:

- One pack per row group.
- Each flip or caveat gives blanks.
- An answered client_role overrides the table.

**Remaining card strings: signed** (13 Oct 2026). Two edits for consistency:

- title `Annexures`
- loading `Preparing your annexures…` (edited)
- error `We couldn't create the annexures. Please try again.` (edited, as Mahak suggested)
- retry `Try again`
- missing title `Party details are missing`
- missing body `Add the names and roles of the parties to this draft, then try again.`
- missing named `Add {what} to this draft, then try again.`, where `{what}` is `the client's name` or `the opposite party's name`, or both joined with `and`

No cost, "free" or disclaimer wording, as Mahak listed.

## Addendum 4 (13 Oct 2026): Mahak's two calls after the server build

1. **"State of {state}, through the concerned authority" under every respondent: (a) now, (b) as a ticket.** For now, brief drafts store `court_type` only. `state` is stored only for the State rows (bail and criminal), so today's output does not change. In T-396 (Kunal), the memo prints the State line only when the counterpart is the State, never under a private respondent. The same applies to form drafts that already set `state`; that is an existing bug.
2. **Refusing ambiguous, caveat and no-row cases: accepted for v1.** A refusal is safer than a guessed client. The message must not say a name is missing when only the side is unknown. For these cases, `{what}` is `the client's role`, which gives "Add the client's role to this draft, then try again." Priya: please log a follow-up to offer the client_role question on such drafts.

**Extra detail rows, signed:**

- cat_oa: client address ← `applicant_office_address`
- mact_claim: client age ← `victim_age_at_accident`
- counter_affidavit and rejoinder_affidavit: client age and address ← `deponent_age` and `deponent_address` (the deponent is the client in both)

**Addendum 4: the State line for 5 packs (14 Oct 2026, Kunal's T-396).** Drop the line, as built, for bail_cancellation, criminal_appeal, criminal_revision, itat_appeal and writ_petition_criminal. The State is not always a party in these:

- In itat_appeal the counterpart is the tax authority.
- In bail_cancellation the respondent is the accused.
- In criminal_appeal and criminal_revision it depends on who files.
- In writ_petition_criminal the respondents come from the advocate's list.

A State printed where it is not a party is wrong, and the advocate can name it in the respondent fields. Only the 10 bail and quashing packs keep the line.

## Addendum 5 (14 Oct 2026, T-424): counter and rejoinder affidavits

The rows already exist in Addendum 3 and are confirmed here, with the detail rows from Addendum 4:

| Pack | Client (deponent) | Counterpart | Client's side in the Memo |
|---|---|---|---|
| counter_affidavit | parties.respondent_name (age and address ← deponent_age, deponent_address) | parties.petitioner_name | Respondent |
| rejoinder_affidavit | parties.petitioner_name (age and address ← deponent_age, deponent_address) | parties.respondent_name | Petitioner |

**Side rule.** The Memo prints each party under its own role in the case: the petitioner as petitioner, the respondent as respondent. The client is never printed as "applicant" or moved to the filer's side because the client is filing the affidavit. An answered `client_role` overrides the row. If the side cannot be told, the draft is refused with the T-381 422 response and nothing is guessed.

Tests: counter_affidavit with the client as respondent prints the respondent as deponent and on the respondent side; rejoinder_affidavit is the mirror case.

**Addendum 5, part B (14 Oct 2026, Mahak's T-424 questions).**
1. **Deponent designation: signed.**
   - counter_affidavit: `the above-named Respondent`
   - rejoinder_affidavit: `the above-named Petitioner`

   The designation follows the resolved client side, so an answered `client_role` of respondent or petitioner gives the matching word. An explicit `deponent_designation` (for example "Respondent No. 2") still wins. The deponent is never called "Applicant" on these two packs.
2. **A client_role other than petitioner or respondent on these two packs: refuse.** Return the T-381 422 (missing: client_role) and guess nothing.

**FYI, agreed:** `{deponent_name}` filled from `applicant_name` on the drafting path is the same wrong-side risk, so it goes to Priya as a follow-up.

**T-424 part B wording (14 Oct 2026, Mahak's three questions).**
1. **Memo row labels on counter_affidavit and rejoinder_affidavit: always `Petitioner` and `Respondent`**, whatever the court rule's party_designation says. These packs are filed in petition proceedings, and their fields are petitioner and respondent. Must-fix.
2. **The doubled "the": approved.** Drop the template's "the" so the line reads `That I am the above-named Respondent` (or whatever designation applies). This changes the line on every pack. Condition: the golden diff only removes that one "the" in that line, on every pack, with no other byte. Send it to me. Must-fix: it is a typo in a sworn document.
3. **Synopsis "The petitioner has approached this Hon'ble Court…": leave it.** In a counter affidavit that sentence is accurate, because the petitioner did approach the Court and the respondent is answering. No change.

**T-424 golden (3aea8ef): signed.** 13 entries ("annexures pack HTML per court"), each exactly -1/+1: `That I am the the above-named…` becomes `That I am the above-named…`. No other line changes. The generic "Applicant/Petitioner" designation on other packs is unchanged and outside this ruling.
