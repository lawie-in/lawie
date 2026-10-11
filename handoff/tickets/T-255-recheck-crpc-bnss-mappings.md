# T-255 — Full recheck of the CrPC→BNSS mappings table

| Field          | Value |
| -------------- | ----- |
| Phase          | 1 — Describe and draft |
| Owner          | Ajay (rechecks every pair against the Gazette, signs). Lead (applies) |
| Mode           | Rule first, then a small build. Legal content |
| Status         | To do. Waits for Ajay. Follow-up to T-250, 12 Oct 2026 |

Ajay spot-checked 40 `mappings` pairs in `apps/drafting/src/config/sections/crpc-to-bnss.json` and all were right. But `iea-to-bsa.json` turned out to have 117 of 185 rows wrong, so every remaining pair needs a check.

## Acceptance criteria

1. Ajay rechecks every pair, then signs a corrected file or confirms the current one.
2. The lead applies the corrections only, lists the assertions that change for Ajay, and lists any moved snapshots.
3. Do the same check for `ipc-to-bns.json` if Ajay hasn't verified it row by row.
