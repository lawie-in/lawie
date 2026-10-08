# T-158 legal rulings (Ajay, CLO, 8 Oct 2026)

All rulings below are dated 8 Oct 2026 and are Approved. Source: `scratchpad/ajay-signoff-2026-10-08.md`. They are logged here so later checks have something to match against. Not yet filed in Confluence or Notion.

These rulings cover legal text only. They do not replace Anushka's quality gate.

Disclaimer on every output: "Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing."

---

## AJ-2026-10-08-T157-A2 (also written T157-A1 / -A2)

Date: 8 Oct 2026. Approved.

Decision: the slash labels in DRT and NCLT may wait for T-158 as named exceptions (Risk, not Blocker). T-158 uses these strings:

- DRT (`drt.json`): cause title `... APPLICANT` / `... DEFENDANT`. Same fix for line 18 `applicant`, the line 40 verification text, and its signature line.
- NCLT (`nclt.json`), lines 14, 16, 17 and 39:
  - IBC matters: `... APPLICANT` / `... CORPORATE DEBTOR`
  - Companies Act matters: `... PETITIONER` / `... RESPONDENT`
- `ibc_application.json:17`: `... Corporate Debtor / Respondent` becomes `... Corporate Debtor`.
- Not changed: `description` fields and `notes` lines. The slashes there are fine.

Also in this ruling: "Union Territory of Delhi" is added to the Delhi list (Constitution Art. 239AA(1)). That part belongs to T-157.

---

## AJ-2026-10-08-T158-A1

Date: 8 Oct 2026. Approved. Use these exact strings.

| File | Key | Signed string |
|---|---|---|
| labour_court.json | `petitioner` | `Applicant` |
| labour_court.json | `respondent` | `Opposite Party` |
| labour_court.json | `applicant` | `Applicant` |
| labour_court.json | `complainant` | `Complainant` |
| labour_court.json | `counter_party` | `Opposite Party` |
| tribunal_generic.json | `counter_party` | `Respondent` |
| family_court.json | `state` | Keep as is (Acceptable) |

- "Workman" or "Management" goes in the party description, not the label.
- `complainant` is a Risk, not a blocker: the title is hardcoded APPLICANT, so a s.33A complaint prints Complainant in the body and APPLICANT in the title. Not changed here. Separate ticket (T-173).
- `family_court.state` must stay, because a test needs it non-empty. No renderer may ever print it. A test is required.

---

## AJ-2026-10-08-T158-A2

Date: 8 Oct 2026. Approved. The last unsigned strings. Each is one JSON line, `\n` is the newline escape.

1. `drt.json` `verification_format` (line 40). Signature line `DEPONENT`.

```
"I, {deponent_name}, {designation}, do hereby verify that the contents of paragraphs ___ to ___ above are true to my personal knowledge, and the contents of paragraphs ___ to ___ are based on records and information received, which I believe to be true, and nothing material has been concealed therefrom.\n\nVerified at {place} on this {date}.\n\nDEPONENT"
```

2. `nclt.json` `verification_format` (line 39), chosen by matter type.

IBC (`insolvency_application`, and every `ibc_application` draft):
```
"I, {deponent_name}, the Applicant herein above named, do hereby verify that the contents of paragraphs ___ to ___ of the above application are true to my personal knowledge, and the contents of paragraphs ___ to ___ are based on records and information received, which I believe to be true, and nothing material has been concealed therefrom.\n\nVerified at {place} on this {date}.\n\nAPPLICANT"
```

Companies Act 2013 (`company_petition`):
```
"I, {deponent_name}, the Petitioner herein above named, do hereby verify that the contents of paragraphs ___ to ___ of the above petition are true to my personal knowledge, and the contents of paragraphs ___ to ___ are based on records and information received, which I believe to be true, and nothing material has been concealed therefrom.\n\nVerified at {place} on this {date}.\n\nPETITIONER"
```

Matter type unknown. No visible blank under a signature:
```
"I, {deponent_name}, do hereby verify that the contents of paragraphs ___ to ___ above are true to my personal knowledge, and the contents of paragraphs ___ to ___ are based on records and information received, which I believe to be true, and nothing material has been concealed therefrom.\n\nVerified at {place} on this {date}.\n\nDEPONENT"
```

3. `ibc_application.json:17` `causeTitle.format`. The only change is the last suffix, `... Corporate Debtor`.

```
"BEFORE THE HON'BLE NATIONAL COMPANY LAW TRIBUNAL\nBENCH AT {nclt_bench}\n\n{caseNomenclature}\n\nIN THE MATTER OF: The Insolvency and Bankruptcy Code, 2016;\nAND IN THE MATTER OF: Section {section_invoked} of the Code;\nAND IN THE MATTER OF: Application for initiation of Corporate Insolvency Resolution Process against {corporate_debtor_name};\n\n{applicant} ... Applicant\nVERSUS\n{corporate_debtor_name} ... Corporate Debtor"
```

Open from this ruling, as separate tickets:
- `deponent_name` is the applicant's name. For a bank or company it should be the authorised officer (Risk; touches `services/`).
- `_meta.change_protocol` in `ibc_application.json` cites the wrong forms (Acceptable cleanup).
- Pin the two old verification strings in a regression test so they cannot come back.

---

## AJ-2026-10-08-T158-diff

Date: 8 Oct 2026. Approved, with conditions C1 and C2, plus Call 2 and a drt fix.

- The config diff matches T158-A1, T157-A2 and T158-A2.
- Matter type is read from the document type, not from the courts DB. Acceptable: all 21 NCLT rows carry "Company Petition No.", so the DB would label every IBC application as a Companies Act matter.
- **C1 (fix in T-158).** Add these keys to the override blocks in `nclt.json`:
  - `insolvency_application.party_designation`: `"applicant": "Applicant"`, `"complainant": "Applicant"`, `"counter_party": "Corporate Debtor"`
  - `company_petition.party_designation`: `"applicant": "Petitioner"`, `"complainant": "Petitioner"`, `"counter_party": "Respondent"`
- **Call 1: unknown-matter labels.** Approved exactly as in the diff:
  - `petitioner`: `[To be confirmed: Applicant (IBC) or Petitioner (Companies Act)]`
  - `respondent`: `[To be confirmed: Corporate Debtor (IBC) or Respondent (Companies Act)]`
  - cause-title suffixes (mixed case, as in the diff): `[To be confirmed: APPLICANT (IBC) or PETITIONER (Companies Act)]` and `[To be confirmed: CORPORATE DEBTOR (IBC) or RESPONDENT (Companies Act)]`
- **C2 (fix in T-158).** In the PARTY DESIGNATIONS prompt block, add this exact line when any value starts with `[To be confirmed:`:
  `- If a designation above begins with "[To be confirmed:", reproduce it exactly as written wherever that party is named. Do not choose between the options.`
- **Call 2.** `ibc_application.json` line 21 `label` is `"Applicant"`. Line 23 `label` is `"Corporate Debtor"`.
- **drt.json:19.** `defendant` is `"Defendant"` (was "Defendant Borrower").
- Open as separate tickets: the IBC case number (use `C.P. (IB) No. _____ of {year}` in both `nclt.json:25` and `ibc_application.json`; touches `services/`); `deponent_name`; the `_meta` cleanup.

---

## AJ-2026-10-08-T158-A1-ext (family_court.state)

Date: 8 Oct 2026. Approved, option (a), fixed inside T-158. Reference: Family Courts Act, 1984 s.7(1) Explanation and s.7(2).

Decision: the "Not applicable" text in `family_court.state` is an internal note and must never print.

1. Skip test: if `designation.state`, trimmed and lower-cased, starts with `not applicable`, treat it as not set. One shared helper for the engine and the prompt.
2. Engine: `{state_respondent}` prints `[To be confirmed: name of the State]`. It must not fall through to the `State of ${ctx.state}\nThrough Public Prosecutor` default.
3. Prompt: the PARTY DESIGNATIONS list leaves out the `state` key completely.

Test required: family_court with a `{state_respondent}` template has no "Not applicable" and no "Public Prosecutor", and has the blank. The prompt has no `state:` line.

Flag for Priya (not a T-158 blocker): bail templates are offered against family_court courts, which have no bail jurisdiction (FC Act ss.7-8). Needs a product ticket.

---

## AJ-2026-10-08-T158-drafter

Date: 8 Oct 2026. Approved.

Decision: the Drafter path in `ai.service.ts` (`drafterPartyDesignationLines`) now uses the shared `promptPartyDesignations` helper. This meets T158-A1-ext item 3, C1 and C2.

Conditions before the PR:
- Tests for the Drafter path. Test 3 checks the rendered prompt: the C2 line appears exactly once and never as `- -`. Test 5 is a parity guard between the two prompt paths.
- `t149-party-labels.test.ts` calls `drafterPartyDesignationLines` instead of an inline copy.
- No snapshot changes.
