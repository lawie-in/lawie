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
