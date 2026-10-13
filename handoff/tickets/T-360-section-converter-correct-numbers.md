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

## Shashank's trace (13 Oct 2026, read-only)

(a) **Old seed on develop, not code.** The pre-T-255 table (83c325e^) has 358→398 … 362→402, exactly what Anushka saw. seed-sections.ts skips existing rows unless run with --force, so develop was never reseeded. **Founder:** clean build, then `seed:sections --force` (docs/seeding.md §7), then delete the Redis keys sections:forward, sections:reverse and sections:loaded_at. The cache lives 1 hour and is not refreshed by the seed or on startup.

(b) **Code bugs a reseed won't fix (this ticket):**
1. The bulk regex (sections.service.ts:575) needs the code word right after each number. "Sections 420, 406 and 120B IPC" converts only 120B. It also misses "Evidence Act".
2. No parent fallback: "156(3) CrPC" returns 404. Ajay's rule is 175(3).
3. Unconverted references in bulk are left silently, with no label.
4. A section not found shows "No mapping found", not "Not verified — check the Gazette".
5. The bulk UI shows no label per reference.
6. Optional hardening: the seed calls invalidateCache, and the false "refreshed on startup" comment is corrected.

Files: apps/drafting/src/services/sections.service.ts, routes/sections.routes.ts, apps/web/src/app/tools/section-converter/page.tsx, tests; seed-sections.ts only for item 6. Full chain. Label text per Ajay's signed T-360 file.
