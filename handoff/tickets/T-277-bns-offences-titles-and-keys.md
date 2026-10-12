# T-277 — bns-offences.json: wrong titles and missing keys

| Field          | Value |
| -------------- | ----- |
| Phase          | 1 — Describe and draft |
| Owner          | Ajay (signs corrected titles). Lead (builds; shashank, after T-267) |
| Mode           | Rule first, then a small build. Legal content (`apps/drafting/src/config/`, check against `legal-content-paths.md`) |
| Status         | To do. Raised by Ajay from Shashank's T-267 findings, 12 Oct 2026. Ajay will sign corrected titles |
| Depends on     | T-267 merged |

## Problem

- About 65 titles in `bns-offences.json` do not match the Gazette (blocks shifted: 104, 105, 114, 128–130, 138, 200–269, 290–354).
- 255 of the 534 table targets (318(4), 316(2) and so on) are not keys, so bail-check says "not found" for IPC 420, 406 and 392.

## Plan

Ajay signs corrected titles for all 358 BNS sections; sub-sections resolve to their parent section's title. Shashank builds the file and the key resolution, lists changed tests and goldens for Ajay.

## Acceptance criteria

1. Every BNS title matches Ajay's signed list.
2. A sub-section target such as 318(4) resolves to the parent title; bail-check no longer says "not found" for IPC 420, 406 and 392.
3. Ajay sees the diff and moved goldens before merge.
