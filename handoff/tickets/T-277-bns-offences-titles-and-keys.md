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

## Arjun (12 Oct 2026): the rule for reading `sections_charged` (round 4)

Why the old code goes wrong: `classifySectionsBailability` splits on every comma, so `BNS 64, 115(2) (IPC 376, 323)` becomes the pieces `BNS 64`, `115(2) (IPC 376` and `323)`, and `323` is then looked up as a BNS section. The reader below replaces that split. One function (`readSectionsCharged(text) -> { code, number }[]`, next to the shared `resolveBnsKey`) is used by the "use EXACTLY" block, preflight (incl. E1) and the validator. Nothing else parses this field.

**Steps, in this order**
1. **Clean.** NFKC, strip zero-width characters, collapse whitespace, lower-case for matching only.
2. **Remove what is never a section.** (a) Dates (`dd/mm/yyyy`, `dd-mm-yyyy`, `dd.mm.yyyy`) and the words after `dated`/`on`. (b) Case and FIR references: `FIR`, `Crime No.`, `Case No.`, `No.` followed by digits with optional `/year`. (c) **Any run of 4 or more digits.** A section number has 1 to 3 digits (BNS 358, BNSS 531, BSA 170, IPC 511); so `2023` in `Section 103 of the Bharatiya Nyaya Sanhita, 2023` can never be read as a section, nor `1860`, nor `2024` in `Crime No. 123/2024`.
3. **Names of codes** (matched ignoring case, dots, spaces and `of`): `bns` or `bharatiya nyaya sanhita` → BNS; `bnss` or `bharatiya nagarik suraksha sanhita` → BNSS; `bsa` or `bharatiya sakshya adhiniyam` → BSA; `ipc` or `indian penal code` → IPC; `crpc`, `cr.p.c.` or `code of criminal procedure` → CRPC; `iea` or `indian evidence act` → IEA. Any other `… Act` → OTHER (kept, never classified).
4. **A number** is `1–3 digits`, an optional capital letter (`376A`), then any number of attached brackets with no space before them: `115(2)`, `318(4)`, `64(2)(a)`. A bracket after a space is **not** part of the number.
5. **Bracket groups.** A bracket after a space that contains a code name is an **alias list**. Its numbers are read on their own with the code named inside it, and it never changes the code of the list around it. After it closes, the outer list continues with its own code. A bracket after a space that contains **no** code name is a comment (`(non-bailable)`, `(main accused)`): its contents are ignored, numbers included.
6. **Segments.** Split at the top level only (bracket depth 0) on `,` `;` `&` `and`, and on read-with markers `r/w`, `r.w.`, `rw`, `read with`. Each segment is a list.
7. **Which code a number takes.** In its own list (brackets already cut out):
   - code name **before** the numbers (`BNS 64, 115(2)`): the code applies to every number after it until another code name appears;
   - code name **after** the numbers (`302, 34 IPC`, `302 IPC`): it applies to every number back to the previous code name or the start of the list;
   - **no code name in the list**: the number is **bare**. A bare number is never labelled BNS, never classified, and never looked up in `bns-offences.json`. It stays in the list as `code not stated` (existing wording: "verify from First Schedule"), and preflight treats it as it does today for an unknown code.
8. **Labels by code.** BNS: looked up with `resolveBnsKey` (a sub-clause resolves to its parent for the title; the bailable label only if the parent row says so, per my 12 Oct conditions; unknown parent still blocks). IPC, CRPC, IEA: Ajay's old-law line, no bailability, **never** converted to or labelled BNS. BNSS, BSA: **no label at all**, but kept in the list. OTHER: kept, no label.
9. **Dedupe** on `(code, number)`, keep first-seen order.

**Shapes to test (each is a fixture; expected output as `code number`)**

| Input | Must give |
| ----- | --------- |
| `BNS 64, 115(2) (IPC 376, 323)` | BNS 64, BNS 115(2), IPC 376, IPC 323. **Not** BNS 323 |
| `BNS 64 (IPC 376), 115(2)` | BNS 64, IPC 376, BNS 115(2) |
| `BNS 318(4) (IPC 420)` | BNS 318(4), IPC 420 |
| `302 IPC r/w 34 IPC` | IPC 302, IPC 34 |
| `302, 34 IPC` | IPC 302, IPC 34 |
| `IPC 302/34` | IPC 302 (a bare `/34` is a bare number: code not stated; asserted explicitly) |
| `Section 103 of the Bharatiya Nyaya Sanhita, 2023` | BNS 103 only |
| `BNS 103(1), 2023` | BNS 103(1) only |
| `103, 105` | bare 103, bare 105: no label, no BNS |
| `BNS 103 (non-bailable), 351` | BNS 103, BNS 351 (comment ignored, `351` inherits BNS) |
| `BNSS 480, BSA 63` | BNSS 480, BSA 63: kept, no label |
| `BNS 303, BNSS 187 and 479` | BNS 303, BNSS 187, BNSS 479 |
| `FIR No. 123/2024 u/s BNS 303` | BNS 303 only |
| `NDPS Act 20, BNS 303` | OTHER 20 (no label), BNS 303 |
| `BNS 103, BNS 103` | BNS 103 once |
| `` and `null` | empty list, no throw |

**Also assert, once, in the prompt block test:** for every fixture above, no old-law (IPC, CRPC, IEA) or bare number appears in the "use EXACTLY" block with a BNS label or a BAILABLE / NON-BAILABLE word. That is the property that failed in round 3.

If Ajay disagrees with step 7's choice that bare numbers are not read as BNS, it is a one-line change to the default code; the reader takes the default as a parameter (`defaultCode: undefined` today). It is the safe choice because the picker (`multi_select_search`) writes the code with every value, so bare numbers come only from free text.

## Arjun (12 Oct 2026): correction to step 7 (Shashank, round 4)

My statement that the picker writes the code with every value was wrong. `DynamicFormRenderer` (`fetchBnsMappingResults`, l.~823) stores `id = r.section`, so a picker value is a bare number such as `"303"`, and the same array also takes free text (`allowFreeText` for `source: bns_mapping`). Changes to the rule:
1. **Array values for a field with `source: bns_mapping` are read with `defaultCode: 'BNS'`** (the picker searches BNS only). An explicit code in an entry always wins (`"302 IPC"` is IPC 302). Plain strings, the brief, and any other field keep `defaultCode: undefined`, so a bare number there stays bare. The call site passes the default; `readSectionsCharged` itself stays pure.
2. **Known residual, accepted:** a bare old-law number typed as free text into the BNS picker (`"302"`) is read as BNS 302. The field and its search are BNS; the web hint should tell users to type the code for old-law numbers (outside this ticket; Priya to log for the web). Nothing to build here beyond a test that documents it.
3. **A bare number is a soft warning, never a block.** Preflight does not say "BNS Section 103 is not in the First Schedule" for a number with no code. It warns: "Section 103 has no code (BNS, IPC …). Add the code so it can be checked." The draft is not blocked and no label is written. Hard blocks stay only for an explicit BNS code with an unknown parent (`BNS 999(1)`), as I conditioned earlier.
4. Fixtures to change: `103, 105` as a free-text string → two bare numbers, warning, no block; `["303","351"]` from a `bns_mapping` field → BNS 303, BNS 351 labelled as today; `["303","302 IPC"]` → BNS 303, IPC 302.

## Arjun (12 Oct 2026): preflight outcome for other codes (Shashank's question)

Not as intended for old-law codes. T-277 fixes how sections are read and labelled; it does not loosen a gate.
- **IPC, CrPC, IEA in `sections_charged`: preflight keeps exactly the outcome it has on `develop_staging` today** (same block, same message, same E1 behaviour). The form's `auto_convert_old` converts old numbers at entry, so an old code still in the field is a gate case, not a label case. Ajay's old-law line in the prompt block applies where the draft is allowed through (describe-first and, later, the T-245a old/new-law switch); it is not a reason to open the gate.
- **BNSS, BSA and other Acts: not blocked.** Before, they hard-blocked only by accident (their numbers were looked up as BNS and reported "not in the First Schedule", which is false). They stay in the list, no label, no block.
- **Bare number:** soft warning, as already decided.
- Tests: one fixture per code showing preflight's result before and after (IPC/CrPC/IEA: identical to `develop_staging`, assert it with the exact message; BNSS/BSA/other Act: passes with no label). If the old gate was not intentional for one of IPC/CrPC/IEA, say so in the report and leave it for Ajay; do not change it here.
