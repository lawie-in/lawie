# T-340: one date format, and the fact-alteration check (signed)

Signed: Ajay (CLO), 12 Oct 2026 IST. Build checked: `a5de025` on `fix/t-345-t340-template-engine-fixes`.

| Check | Result |
|---|---|
| Printed format | `4 April 2026` (D Month YYYY, no leading zero) for `current_date` and for date fields. This matches T-192 and T-349. |
| `getDateVariants` | Numeric dates are read day first only. The variants are the numeric forms plus `D Month YYYY` and `DD Month YYYY` with the full month name, for the same day, month and year only. |
| Matching | A date counts as present only with no digit directly before or after it. `1.3.2026` inside `11.3.2026` and `01.03.2026` against `11 March 2026` are both flagged. |
| Golden snapshots | Unchanged (91/91). |

Mark: **Approved.** Any change to `checkFactAlteration` or `getDateVariants` needs a fresh sign-off.
