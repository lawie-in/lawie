# T-360 — Section converter gives correct numbers and says "Not verified"

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (drafting data) + Ajay (sign every mapping change) |
| Mode   | Full chain |
| Status | To do. RELEASE GATE for main (Anushka FAIL). Unassigned. Priya, 13 Oct 2026 |
| Source | Anushka run 3 FAIL, 13 Oct 2026 (handoff/quality/2026-10-13-run-3-develop-FAIL.md). Failed entries: T-250, T-255, T-275, T-296 |

## Acceptance criteria

1. CrPC 358–362 map to BNSS 399–403 (one section on from today). Ajay checks the whole CrPC→BNSS table around them for the same shift and signs the corrected rows.
2. A section Lawie has not confirmed shows "Not verified — check the Gazette". It never shows a guessed number or "No mapping found". 156(3) CrPC is the test case.
3. Bulk Text Converter: "Sections 420, 406 and 120B IPC and Section 156(3) CrPC…" converts 420, 406 and 120B. 156(3) CrPC and 65B Evidence Act are converted or marked. No IPC number is left reading as a BNS number.
4. Bulk results show "None", "Not verified" and merged/split labels like the single lookup.
5. Tests pin 358–362, 156(3) and the bulk sentence above.

Anushka's reproduce steps are in the run 3 report; use them as the test cases. Anushka re-tests on develop after merge.

## Ajay (13 Oct 2026, signed 96d0654, handoff/legal/T-360-converter-rows-signed.md)

- The signed table is already correct (358→399 … 362→403). No rows change. The converter serves something else: a stale seed or an off-by-one lookup. The lead traces it in Explore (check the develop database seed against the table).
- Checked: rows 356–380, 156(3)→175(3), 65B→63.
- The exact unverified text: "Not verified — check the Gazette".
