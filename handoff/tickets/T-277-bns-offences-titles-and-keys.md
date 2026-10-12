# T-277 — bns-offences.json: wrong keys, titles and attributes (HIGH)

| Field          | Value |
| -------------- | ----- |
| Phase          | 1 — Describe and draft |
| Owner          | Ajay (signs corrected titles). Lead (builds; shashank, after T-267) |
| Mode           | Rule first, then a small build. Legal content (`apps/drafting/src/config/`, check against `legal-content-paths.md`) |
| Status         | To do. HIGH (same class as T-263), per Ajay 12 Oct 2026. Ajay is rebuilding and will sign the corrected file; no build before his signed file |
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

## Bigger than titles (Ajay, 12 Oct 2026)

Ajay checked `bns-offences.json`: 67 of 305 rows sit under the wrong key (for example key 104 holds culpable homicide, but 104 is murder by a life-convict; key 114 holds hostage-taking, but 114 is Hurt; blocks 128-130, 200-269 and 290-354 are shifted). Each row carries bailable / cognizable / punishment, so bail-check can show the **wrong bailability** for a section.

Ajay is rebuilding: re-key every row, verify bailable / cognizable / compoundable against the BNSS First Schedule, and resolve sub-section targets. Where an attribute cannot be verified from the First Schedule he sets it empty, never a guess. He signs the corrected file (like T-250/T-255); Shashank applies it byte for byte, with the usual SHA-256 and tests listed for Ajay.

Until then: no build.

## Arjun's conditions and Ajay's R4 (12 Oct 2026, Priya's call)

Arjun (CTO) approved the preflight change with conditions: one shared `resolveBnsKey` used by preflight (incl. E1) and validator; unknown parent still hard-blocks (999(1)); a parent-resolved sub-clause does not inherit the parent's BAILABLE/NON-BAILABLE label unless the parent row says so; only table-derived labels in the "use EXACTLY" prompt block; golden tests (103(1) passes, 999(1) blocks, 103(1) classifies as 103, generated bailability equals offences[*].bailable for all 305 keys).

Arjun asked for a generated `bns-bailability.json` with a script and a CI drift check. Ajay's ruling R4 is to delete `bns-bailability.json` and derive the classification from `bns-offences.json` at load time, with no second file. Decision: load-time generation meets Arjun's actual condition (never drift), more strictly than a generated file plus a CI check, because no copy exists. R4 stands; no ci.yml or script is added. The "equals offences[*].bailable for all 305 keys" test stays.
