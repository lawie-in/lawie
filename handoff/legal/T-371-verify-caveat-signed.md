# T-371: caveat line for verify-flagged offence rows (signed)

Signed: Ajay (CLO), 13 Oct 2026 IST. Applies Arjun's T-371 ruling. Read together with T-361 Addendum 1 (e3df5a0). Where they differ, this file wins.

## The caveat

Each of the 84 `bns-offences.json` rows with a `verify` note shows its normal result, plus this one line, exactly:

`The BNSS First Schedule does not classify this section in one simple line. Check it for your case before relying on this result.`

I checked all 84 notes. The line is true for every one of them: classification by sub-section, by the offence it refers to, a definition-only section, no Schedule row, or an unusual combination as printed. It is shown once per section, in the bail checker and the converter alike. Raw `verify` text is never shown.

## Lines that stay

| Case | Text |
|---|---|
| An attribute (bailable / cognizable / compoundable) is `null` | `Depends on the sub-section or the offence — see the BNSS First Schedule.` in place of the value. The caveat above is shown too. |
| A section that is missing, or an unverified or null-target mapping row (T-360) | `Not verified — check the Gazette` |
| `max_years` is `null` (44 rows, all of them verify-flagged) | Shown with the caveat above, and left out of the "most serious" ranking. Do not use `Not verified — check the Gazette` here: these rows are signed (T-277), so that line would be false. |

## Addendum 1: Shashank's six points, 13 Oct 2026

| # | Ruling and exact text |
|---|---|
| 1 | Bail checker: a BNS number from 1 to 358 with no row and no parent row keeps the T-277 rule 3 line, `This section does not create an offence. Check the Gazette.` `Not verified — check the Gazette` is for numbers outside the BNS (above 358, or a sub-section the Act does not have) and for converter mapping misses. |
| 2 | Agreed. A signed repealed row keeps "None" and its signed badge (`Repealed — no equivalent`). "Null-target" in this file means a target that is missing with no signed repealed status. |
| 3 | Triable-by keeps its own signed T-289 line. The "Depends on the sub-section…" line covers bailable, cognizable and compoundable only. |
| 4 | When no entered section has a known maximum, show exactly: `The most serious offence cannot be worked out from these sections. Check the BNSS First Schedule.` |
| 5 | Converter hint, exactly: `Enter a section number and its code, for example IPC 302 or BNS 103(1).` (The example must resolve. A bare "BNS 103" is point 6.) |
| 6 | A reverse lookup of a bare BNS section that has only sub-section rows lists those rows (103(1), 103(2) …), each with its own label. `Not verified — check the Gazette` shows only when no row sits under that section. |

Out of scope: BNS 61(2) showing "not an offence" is a bug. Under T-277 rule 3 it resolves to its parent row 61 (criminal conspiracy), using the 61(2) variant where there is one. It needs its own ticket.
