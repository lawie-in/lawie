# T-426: bail case lines by court type (Ajay, CLO, 14 Oct 2026)

Read: `case_nomenclature.regular_bail` / `anticipatory_bail` / `default_bail` in all 51 files under `apps/drafting/src/config/court-rules/` on develop_staging.

## Finding

I cannot verify the state-specific district abbreviations against a primary source. Several look borrowed from High Court case types, not from the district or Sessions registry:
- `od_district` uses BLAPL / ABLAPL.
- `tn_district` anticipatory uses Crl. O.P.
- `kl_district` uses C.M.P. / Crl. M.C.

Wherever a case line is filled in, the registry assigns the case type and number on filing. So a plain description of the application is accurate at every court, and a wrong abbreviation is not.

## Ruling (district, Sessions and Magistrate courts: every `*_district`, `sessions_generic`, `cjm_generic`, `jmfc_generic`)

| Pack | Case line |
|---|---|
| bail_regular, default_bail, interim_bail, bail_before_magistrate | `Bail Application No. _____ of {year}` |
| bail_anticipatory (Sessions and district only; T-425 removes Magistrate courts) | `Anticipatory Bail Application No. _____ of {year}` |

This replaces every state abbreviation, "Criminal Case No." at CJM/JMFC (that line is the trial case, not the bail application), and "Criminal Miscellaneous Case No." at Sessions and in the Bihar, Jharkhand and UP district rules. A state line can come back only after it is verified, row by row, with its source.

Answers to the T-404 part 2 questions:
- (a) Don't use the district criminal list lines; take the row above.
- (b) CJM/JMFC: change to `Bail Application No.`.
- (c) Sessions: change to `Bail Application No.`.

## High Courts and the Supreme Court: verify, unchanged for now

These are HC or SC case types, and I am not changing them without a source:
- Allahabad: anticipatory prints the regular "Criminal Misc. Bail Application No.".
- Jharkhand and Patna: "Cr. Misc. No." for both.
- Delhi: "Bail Appln." for both.
- `high_court_generic`: `_____ No.`.
- `supreme_court`: "Bail Application No." and "SLP (Crl.) No.".

These go to a verify ticket and stay as they are until I sign each row.

## For the build (new ticket from Priya; feeds T-404 part 2)

Edit the court-rules JSON for the rows above. Golden entries that move come to me, and only `case_nomenclature` may change.
