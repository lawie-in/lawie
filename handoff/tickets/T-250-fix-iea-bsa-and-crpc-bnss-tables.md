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
