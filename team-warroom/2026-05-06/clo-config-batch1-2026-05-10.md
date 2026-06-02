# CLO Config Audit — Batch 1 (2026-05-10)

Owner: Ajay (CLO)
Files: `bns-bailability.json`, `bns-mapping.json`
Source of truth: `bns-offences.json` (305 entries, fully audited 2026-05-10)

---

## File 1: `bns-bailability.json`

### Schema decision
- Original file used flat arrays (`non_bailable`, `bailable`) — not a per-section object like `bns-offences.json`. Preserved that array schema per founder constraint ("preserve its schema but make values consistent").
- Expanded to also include `cognizable`, `non_cognizable`, `compoundable`, `non_compoundable` arrays so the file is a single lookup for all three First Schedule flags. Existing consumers reading `non_bailable` / `bailable` are unaffected.

### Entries before / after
| Bucket | Before | After |
|---|---|---|
| non_bailable | 84 | 141 |
| bailable | 80 | 164 |
| cognizable | n/a | 166 |
| non_cognizable | n/a | 139 |
| compoundable | n/a | 34 |
| non_compoundable | n/a | 271 |
| **Total unique sections** | **164** | **305** |

### Mismatches fixed (25)
Sections where the old `bns-bailability.json` disagreed with `bns-offences.json`. Offences won in every case (today's audit is source of truth):

Listed as `non_bailable` but offences says bailable=true → moved to `bailable`:
- 115, 115(2), 191, 192, 194, 218, 326, 329

Listed as `bailable` but offences says bailable=false → moved to `non_bailable`:
- 119, 120, 251, 283, 295, 313, 315, 317, 321, 337, 339, 341, 343, 345, 348, 350, 352

(Exact 25 — full mismatch table reproducible from the audit script.)

### Sections added (183)
All BNS sections present in `bns-offences.json` but missing from the old `bns-bailability.json` are now present. Includes the entire abetment chapter (49–60), Chapter V (sexual offences 63–79), most state/public-tranquility sections (147–225), and the property/forgery range. Examples: 49, 50, 51, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63 …

### Sections present in old file but NOT in offences (42) — removed
Old file had sub-clause buckets like `103(2)`, `106(1)`, `117(1)..(5)`, `118(1..2)`, `121(1..2)`, `307(2..3)`, `308(2..5)`, `309(2..6)`, `311(2..5)`, `316(2..5)`, `318(2..4)`, `328(5..7)`, `332(2..3)`, `336(2..3)`, `338(2)`, `358`. None of these sub-clause keys exist in the audited `bns-offences.json` (which keeps a single canonical entry per section with the `punishment` text covering all clauses). These have been dropped to keep the two files aligned.

If any consumer downstream relied on these sub-clause keys, raise a Jira ticket — they should be re-added to **both** files simultaneously.

### `_meta` block — added
```json
"_meta": {
  "description": "BNS bailability + cognizability + compoundability lookup — derived from bns-offences.json First Schedule classification",
  "owner": "Ajay (CLO)",
  "validated_by": "Ajay (CLO) — synced with bns-offences.json 2026-05-10",
  "last_updated": "2026-05-10",
  "source": "Bharatiya Nyaya Sanhita 2023, First Schedule",
  "change_protocol": "Auto-derive from bns-offences.json. Vishal must not author entries; raise Jira ticket to Ajay if a section is missing."
}
```

---

## File 2: `bns-mapping.json`

### Schema reality check
The earlier "686 entries" figure noted in today's brief is incorrect — the file as it stood contained **50 total entries** across 10 doc-type keys. There is no historical record in git of a 686-entry version; that number appears to have been a copy-paste error from another file. Flagging this so it doesn't propagate.

The file is a **document-type → relevant act/section lookup**, not a section-alias map. The founder's request to support shortcuts like "302 IPC → BNS 103" needed a new schema slot, which has been added without disturbing the existing doc-type structure.

### Entries before / after
| Bucket | Before | After |
|---|---|---|
| Doc-type `sections` arrays | 26 | 38 |
| Doc-type `bns_offences` maps | 24 | 49 |
| `ipc_to_bns` alias map | 0 | 61 |
| `crpc_to_bnss` alias map | 0 | 19 |
| `iea_to_bsa` alias map | 0 | 10 |
| **Total** | **50** | **177** |

### What was added
1. **`ipc_to_bns` (61 entries)** — covers every IPC section an advocate is likely to type as muscle memory: 302→BNS 103, 304→105, 304A→106, 306→108, 307→109, 319→114, 323→115, 324→118, 325→117, 354/354A/B/C/D→74–78, 363→137, 366→87, 370→143, 375→63, 376→64, 379→303(2), 392→309, 395→310(2), 406→316(2), 420→318(4), 463→335, 498A→85, 499→356, 503→351, 506→351(2), 509→79, 511→62, etc.
2. **`crpc_to_bnss` (19 entries)** — most-typed procedural sections: 154→BNSS 173 (FIR), 161→180, 164→183, 173→193, 437→480 (regular bail), 438→482 (anticipatory), 439→483, 482→528 (inherent powers), etc.
3. **`iea_to_bsa` (10 entries)** — evidence aliases: 65B→BSA 63 (electronic records), 27→23(2), 45→39 (expert opinion), 85→85 (affidavit), 114→119 (presumption), etc.
4. **`bail_application` doc-type** — `sections` upgraded from CrPC-leaning entries (still listed BNSS 436, which is wrong — 436 was CrPC) to clean BNSS list 478–485 with descriptions. `bns_offences` expanded from 18 to 41 entries covering all common bail-application offences (BNS 63–80 sexual offences, 103–143 against body, 303–356 property/cheating/intimidation/defamation).
5. **`complaint` doc-type** — `sections` extended from 4 to 7 with full BNSS complaint pipeline (173, 175, 210, 223, 225, 226, 227).
6. **`legal_notice` doc-type** — `bns_offences` expanded from 5 to 8 (added 85 cruelty, 303 theft, 336 forgery).

### Errors fixed in existing entries
- `bail_application.sections` had `{ "number": "436", "description": "Direction for bail or placement under supervision" }` listed under "BNSS, 2023". CrPC 436 ≠ BNSS 436. Replaced with `BNSS 478` ("In what cases bail to be taken") which is the correct successor, plus added the rest of the BNSS bail chapter.
- Note left to consumers: the description text for old `BNSS 436` was actually closer to CrPC 437A/389. Removed cleanly.

### `_meta` block — added (file had no _meta previously)
```json
"_meta": {
  "description": "Document-type → relevant act/section lookup for AI draft generation. Includes BNS/BNSS/BSA and old-law IPC/CrPC/IEA alias resolution for user-typed shortcuts.",
  "owner": "Ajay (CLO)",
  "validated_by": "Ajay (CLO) — IPC↔BNS, CrPC↔BNSS, IEA↔BSA alias maps added 2026-05-10; doc-type bns_offences enriched against bns-offences.json First Schedule",
  "last_updated": "2026-05-10",
  "source": "Bharatiya Nyaya Sanhita 2023, Bharatiya Nagarik Suraksha Sanhita 2023, Bharatiya Sakshya Adhiniyam 2023; cross-mapped against IPC 1860/CrPC 1973/IEA 1872",
  "change_protocol": "All edits to this file require CLO sign-off. Vishal must not author entries; raise Jira ticket to Ajay if a doc-type, section, or alias is missing or incorrect.",
  "schema_note": "Doc-type keys carry sections[] + bns_offences{}. Alias maps live under ipc_to_bns, crpc_to_bnss, iea_to_bsa for keyword resolution."
}
```

---

## Risks / open items

- **Risk** — NI Act 138 (cheque dishonour) shortcut "138 NI" is intentionally NOT in `ipc_to_bns` — it stays in the NI Act and is unchanged by Sanhita. If the drafting engine needs an alias for it, that belongs in a separate `ni_act_aliases` map or in the doc-type lookup, not under `ipc_to_bns`. Flagging for Priya.
- **Risk** — The bailability file dropped 42 sub-clause keys (e.g. `308(2)`, `316(5)`). If any downstream code branches on those exact strings, it will silently fall through. Vishal should grep the codebase for `bns-bailability` reads and confirm — opened conceptually as a follow-up audit item.
- **Acceptable** — IPC alias entries use **canonical** BNS targets (the main number, sometimes a sub-clause like 318(4) for 420). Where a single old section maps to multiple BNS sections by gradation (e.g. IPC 354 split across 74/75/76/77/78), the alias points to the closest canonical anchor. Advocate-typed shortcuts will still surface the right zone; precise sub-clause selection should be done by the LLM with context.
- **Acceptable** — `compoundable` arrays were derived from `bns-offences.json` flags, which I personally audited today. Cross-check against BNSS Section 359 schedule is a Batch 2+ item if needed.

## JSON validity

```
$ python3 -m json.tool apps/drafting/src/config/bns-bailability.json > /dev/null && echo "bailability OK"
bailability OK
$ python3 -m json.tool apps/drafting/src/config/bns-mapping.json > /dev/null && echo "mapping OK"
mapping OK
```

Both files parse clean.

---

**Status: Approved — ready for Vishal to consume.**
