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
