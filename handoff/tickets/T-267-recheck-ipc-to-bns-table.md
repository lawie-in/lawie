# T-267 — Full recheck of the IPC→BNS table

| Field          | Value |
| -------------- | ----- |
| Phase          | 1 — Describe and draft |
| Owner          | Ajay (rechecks every row against the Gazette, signs). Lead (applies; shashank, as with T-250 and T-255). Anushka (checks BNS sections in Tier A samples) |
| Mode           | Rule first, then a small build. Legal content (`apps/drafting/src/config/sections/ipc-to-bns.json`) |
| Status         | Merged into develop_staging (ee93984); IPC table not live until reseed with --force (develop first; production founder-only after T-275); pack corrections live at deploy; waiting for Anushka on develop |
| Depends on     | T-250 + T-255 (same seed path and files) |

## Problem

The IEA→BSA and CrPC→BNSS tables had 117 and 103 wrong rows. `ipc-to-bns.json` feeds every BNS citation in every draft (for example 498A→85), and it has never been checked row by row. Shashank's apply-clo-patch notes already showed six sub-section disagreements against it.

## Acceptance criteria

1. Ajay rechecks every row and signs a corrected `ipc-to-bns.json` (SHA-256, byte for byte), as for T-250 and T-255.
2. The lead replaces the file, updates only the test expectations that encoded a wrong pair (each listed for Ajay), greps for any other BNS number in packs, prompts and tests (each hit listed), and lists moved snapshots.
3. The corrected table is reseeded the same way as T-250: develop first, sample rows, then production with the founder.

## Until Ajay signs

- Marketing says only "Criminal drafts cite BNS, BNSS and BSA", with no accuracy claim.
- Anushka checks the BNS sections in her Tier A samples against the bare act.

## Signed (Ajay, 12 Oct 2026)

233 of 576 rows changed. Build: replace `config/sections/ipc-to-bns.json` byte for byte with the signed JSON block; list changed test expectations and moved goldens for Ajay; grep packs, prompts and converter copy for IPC→BNS numbers outside the table. Rows marked "Pending CLO review" become validated when seeded. Left for Ajay as follow-ups: 4 rows "unverified" (236, 254, 292A, 376DA) and 21 repeals to confirm against India Code.
