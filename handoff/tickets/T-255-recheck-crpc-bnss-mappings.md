# T-255 — Full recheck of the CrPC→BNSS mappings table

| Field          | Value |
| -------------- | ----- |
| Phase          | 1 — Describe and draft |
| Owner          | Ajay (rechecks every pair against the Gazette, signs). Lead (applies) |
| Mode           | Rule first, then a small build. Legal content |
| Status         | Ajay signed the corrected table (handoff/legal/T-255-crpc-to-bnss-corrected-signed.md). Built by shashank in the same branch as T-250: replace crpc-to-bnss.json byte for byte (SHA-256 in the file) |

Ajay spot-checked 40 `mappings` pairs in `apps/drafting/src/config/sections/crpc-to-bnss.json` and all were right. But `iea-to-bsa.json` turned out to have 117 of 185 rows wrong, so every remaining pair needs a check.

## Acceptance criteria

1. Ajay rechecks every pair, then signs a corrected file or confirms the current one.
2. The lead applies the corrections only, lists the assertions that change for Ajay, and lists any moved snapshots.
3. Do the same check for `ipc-to-bns.json` if Ajay hasn't verified it row by row.

## Ajay's signed result (12 Oct 2026)

- 103 of 535 rows were wrong: 97 pointed to the wrong BNSS section, 6 were mapped but deleted in the BNSS (CrPC 10, 27, 144A, 153, 355, 404), CrPC 39/40 were wrongly "repealed", and 166A/166B are BNSS 112/113.
- CrPC 358 → BNSS 399. CrPC 362 → BNSS 403.
- Lead: replace the file, update only the test expectations that encoded a wrong pair (list each for Ajay), and grep for any other BNSS numbers.
