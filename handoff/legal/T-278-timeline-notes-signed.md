# T-278: timeline notes for sections left out (signed, 12 Oct 2026 IST)

Ajay (CLO). Found on Shashank's T-278 check: every left-out section in the timeline gets "Section N does not create an offence, so it was left out of this period.", including old-law and unknown inputs. That is false for "302-IPC" (an offence under the old code) and for a number not in the table. The timeline must say which case it is. Three lines, chosen in this order:

| Case | Exact line |
|---|---|
| Input names IPC, CrPC or IEA (any position, e.g. "302-IPC", "IPC 302") | `{Code} {n} is an old-law section, so it was left out of this period. Use the section converter to find the {NewCode} section.` |
| BNS key or parent row exists and the T-277 resolver says it does not create an offence | `Section {n} does not create an offence, so it was left out of this period.` (unchanged) |
| Anything else (number not in the BNS table, text, a code other than BNS) | `Section {n} was not found in the BNS offences table, so it was left out of this period. Check the Gazette.` |

`{Code}`, `{n}`, `{NewCode}` as in T-295 (`IPC`/`CrPC`/`IEA` casing, code first, `{n}` with any sub-section as typed). Every left-out entry carries exactly one of these lines; tests cover one input per row.

## Addendum 1 (12 Oct 2026 IST)

1. Row 3 now says "BNS offences table" (changed above): "Section 2" exists in the BNS but is not an offence row, so "not found in the BNS table" would read as if the section did not exist.
2. T-277 R1 stands: a sub-section with no row of its own ("103(1)", "BNS 103(1)") gets no period, only the R1 Depends line. My earlier ask that "BNS 103(1)" get its period is withdrawn; test instead that "BNS 103(1)" reads exactly like "103(1)".

## Addendum 2 (12 Oct 2026 IST): row 3 display

When the left-out token carries a code of BNSS or BSA (any position, e.g. "BNSS 187", "187-BNSS"), row 3 drops "Section" and puts the code first:

`{Code} {n} was not found in the BNS offences table, so it was left out of this period. Check the Gazette.`

`{Code}` is `BNSS` or `BSA`. A bare number, text, or another Act's reference ("NDPS Act 20") keeps `Section {n} was not found in the BNS offences table, so it was left out of this period. Check the Gazette.`

## Addendum (T-371), 13 Oct 2026

Another Act's reference (for example "NDPS Act 20") now reads exactly: `Section {n} of another Act was not found in the BNS offences table, so it was left out of this period. Check the Gazette.` Here `{n}` is the number alone, and the user's raw text is not echoed. This replaces the "Section {n}" line for that case only, because a bare "Section 20" would wrongly suggest BNS 20 is missing. Bare numbers and plain text keep the original line.
