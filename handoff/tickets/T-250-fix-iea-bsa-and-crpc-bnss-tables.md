# T-250 — Fix wrong mappings in the IEA→BSA and CrPC→BNSS tables

| Field          | Value |
| -------------- | ----- |
| Phase          | 1 — Describe and draft |
| Owner          | Ajay (corrects the tables from the Gazette text and signs them). Lead (build). Anushka (verdict) |
| Mode           | Rule first (Ajay), then build. Legal content (`apps/drafting/src/config/sections/`) |
| Status         | Ajay signed the corrected text (handoff/legal/T-250-iea-to-bsa-corrected-signed.md). Ready for shashank after T-248. 117 of 185 IEA→BSA rows were wrong |

## Problem

**`iea-to-bsa.json` is off by one for IEA 61–65.** It maps 62→58, 63→59 and 65→61. The correct mapping:
- primary evidence → BSA 57;
- secondary evidence → BSA 58;
- electronic or digital record → BSA 61 (a new provision);
- 65A→62 and 65B→63 are already correct.

Also suspect: 166/167→169/170. BSA 170 is repeal and savings.

**`crpc-to-bnss.json` `new_provisions` has two errors:**
- "173(3) E-FIR" is wrong: 173(3) is the preliminary enquiry, and e-FIR is in 173(1).
- "193(3) police report within 90 days, extendable to 180" is wrong: the 90-day line in 193(3) is about informing the informant of progress.

## Acceptance criteria

1. Ajay's corrected and signed tables are applied word for word.
2. Grep every pack, prompt and test that cites BSA 56–61, BSA 168–170, BNSS 173(3) or BNSS 193(3). List each hit for Ajay; fix only what he signs.
3. Tests: the corrected mappings, plus that no pack cites an old wrong number.
4. Golden snapshots that move are listed for Ajay. CI green on drafting.

## Ajay's signed scope (12 Oct 2026)

- **A.** Replace `iea-to-bsa.json` byte for byte with the file in section A, and check its SHA-256.
- **B.** In `crpc-to-bnss.json`, replace only `new_provisions` (section B).
- **C.** `production_of_documents.json` para 7 cites the wrong BSA 132/134/136/139. Replace it with the text in section C.
- **D.** Update only the test assertions that encoded a wrong pair, and list each one for Ajay. Moved snapshots go to Ajay.
- **E.** Grep the repo for any other BSA number and list each hit for Ajay.

The full recheck of the `crpc-to-bnss` `mappings` pairs (40 spot-checked, all right) is T-255.

T-255's corrected `crpc-to-bnss.json` goes in the same branch (Ajay, 12 Oct 2026).

## Seed and deploy (shashank's finding, Priya's call, 12 Oct 2026)

The app never reads these JSON files directly. They reach users through `seed-sections.ts` → Mongo `SectionMapping` → `sections.service` (prompts, auto-convert fields, the validator, and the `/tools/section-converter` page). So replacing the JSON changes nothing users see until the seed works and is re-run.

Option (a), chosen: this ticket also fixes the seed path.
- **Enum:** `SectionMapping.model.ts` allows only direct, partial, merged, split and repealed. The signed IEA table has 6 rows typed `repealed_no_equivalent`, so the seed would throw. Add that value.
- **Notes:** `seed()` reads `notes`, but the CrPC rows use `note`, so CrPC notes seed empty. Read both.
- **apply-clo-patch.ts** writes values that conflict with the signed table (IEA 32→32 where Ajay signs 26; notes 41C→37(2), 65A→62(2), 65B→63(4)). The signed table wins. Ajay confirms the changes to this script.
- **Re-seed:** `seed()` skips rows that already exist, and `--force` wipes the rows `apply-clo-patch` wrote. Ajay says which of the two to use after the patch is corrected.
- **Deploy note:** the tables are not live in any environment until the seed has been re-run there. Running it against the production database is the founder's step (morning report).

## Ajay's follow-up citations and the seed decisions (12 Oct 2026)

**Eight more hits, signed exactly** (handoff/legal/T-250-followup-citations-signed.md, 551d546), all in Shashank's row:
- `production_of_documents.json` beyond para 7: L218, the provisions entries at L246–254, and L307.
- `bns-mapping.json`: delete the `iea_to_bsa` object, and change "BSA 85 Affidavit" to "Affidavit".
- `court-rules/cjm_generic.json`: L13 and L55, S.16 becomes S.10 and S.23.
- `courts/indian-courts.json`: only the three metropolitan notes (Ahmedabad, Bengaluru, Chennai). The other metropolitan notes are listed for Ajay and left as they are.

**Seed path (Ajay):**
1. The signed tables win over apply-clo-patch's values: IEA 32 → BSA 26; IEA 65A → 62 and 65B → 63 (sub-section 63(4) belongs in the note, not in `new`); CrPC 41C → 37. The new enum value and reading both `notes` and `note`: approved.
2. `apply-clo-patch.ts` is retired. If it holds any line the corrected JSON doesn't carry and that isn't wrong, keep only those lines, corrected, in a patch file Ajay signs. Otherwise delete it. It must never run after the reseed.
3. **Reseed with `--force`.** Skipping existing rows would keep the wrong ones. Condition (Arjun): before `--force` on any database, confirm SectionMapping holds only seeded rows (no admin-edited row; check updatedBy/updatedAt or equivalent).
4. Order: the develop database first. Sample 20 rows against the table (IEA 5, 32, 45, 62, 63, 65A, 65B, 100, 113A, 166; CrPC 41, 97, 154, 167, 362, 358, 437, 439, 482, 10). Then production with the founder (morning list). Put the command in the merge note.

## Reseed note (shashank, 12 Oct 2026)

A stale, gitignored `dist/scripts/apply-clo-patch.js` can still be run locally after the source is deleted. Do a clean build before the reseed, and never run it.
