# T-360: CrPC→BNSS 358–362, and the converter's "Not verified" state (signed)

Signed: Ajay (CLO), 12–13 Oct 2026 IST.

## Finding

The signed table (`config/sections/crpc-to-bnss.json`, from T-250) is already correct. The converter Anushka tested shows values one section lower (358→398 and so on), so the bug is in what the converter serves (a stale seed or a lookup offset), not in the signed table. **No mapping row changes.** The lead finds where 398–402 come from and makes the converter serve the signed table.

## Rows checked (CrPC → BNSS), all correct in the table

| CrPC | BNSS | Heading |
|---|---|---|
| 356 | 394 | Order for notifying address of previously convicted offender |
| 357 | 395 | Order to pay compensation |
| 357A | 396 | Victim compensation scheme |
| 357C | 397 | Treatment of victims |
| 358 | **399** | Compensation to persons groundlessly arrested |
| 359 | **400** | Order to pay costs in non-cognizable cases |
| 360 | **401** | Order to release on probation of good conduct or after admonition |
| 361 | **402** | Special reasons to be recorded in certain cases |
| 362 | **403** | Court not to alter judgment |
| 363–380 | 404–421 | Checked, no shift |

BNSS 398 (witness protection scheme) has no CrPC equivalent. A CrPC lookup must never return it.

Also checked for the bulk test: CrPC 156 → BNSS 175, so 156(3) → **175(3)**; IPC 420 → BNS 318(4); IPC 406 → BNS 316(2); IEA 65B → BSA 63. All are in the signed tables.

## Converter rules (AC2–AC4)

- A sub-section ("156(3)") looks up its parent row ("156") and carries the sub-section across only when the row is `direct`. Otherwise it shows the parent mapping plus the merged/split label.
- A number not in the signed table shows exactly `Not verified — check the Gazette`, with no Copy button. It never shows a guessed number or "No mapping found".
- Bulk results use the same labels as the single lookup ("None", the merged/split labels, "Not verified — check the Gazette"). No IPC/CrPC/IEA number is ever left reading as if it were a new-code number.
