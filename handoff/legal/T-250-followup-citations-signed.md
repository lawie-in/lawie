# T-250 / T-255 follow-up: remaining wrong numbers outside the three replacements (signed)

Ajay (CLO), 12 Oct 2026 IST. Asked by shashank (step 5 grep). Pairs from the signed tables (T-250, T-255): IEA 122 = BSA 128, IEA 123 = BSA 129, IEA 124 = BSA 130, IEA 126 = BSA 132, IEA 129 = BSA 134, IEA 130 = BSA 135, IEA 32 = BSA 26, IEA 45 = BSA 39(1), IEA 65A = BSA 62, IEA 65B = BSA 63, CrPC 12 = BNSS 10, CrPC 29 = BNSS 23, CrPC 41C = BNSS 37. Old-code references (S.123 IEA, S.126 IEA) stay.

## 1 to 3. `production_of_documents.json`

| Where | Replace | With |
|---|---|---|
| L218 | `S.137-138 BSA (formerly S.123-124 IEA) — state privilege` | `S.129-130 BSA (formerly S.123-124 IEA) — state privilege` |
| provisions, `S.132` | `"number": "S.132", "description": "Communications during marriage — privilege"` | `"number": "S.128"`, description unchanged |
| provisions, `S.134` | `"number": "S.134", "description": "Affairs of state — privilege"` | `"number": "S.129"`, description unchanged |
| provisions, `S.136` | `"number": "S.136"`, `Production of title-deeds — witness not bound to produce` | `"number": "S.135"`, description unchanged |
| provisions, `S.137` | `"number": "S.137", "description": "Production of documents — official records"` | `"number": "S.130", "description": "Official communications — privilege"` |
| provisions, `S.139` | `"number": "S.139"`, `Professional communications — legal adviser (replaces S.126 IEA)` | `"number": "S.132"`, description unchanged |
| L307 (`key_citations`, not read by any prompt) | `(now S.134 BSA)` | `(now S.129 BSA)` |

The `key_citations` lists in the packs name judgments. They are never wired into a prompt (T-148 test), so they are dead data and harmless; they are not verified and must not be wired without my sign-off. Priya: a low-priority ticket to verify or delete them.

## 4. `config/bns-mapping.json` (no code reads it)

Delete the `iea_to_bsa` object: a second copy of a section table goes stale and is the cause of the errors found. In the affidavit document-type entry, change `BSA 85 Affidavit` to `Affidavit` (BSA 85 is the presumption as to electronic agreements). Nothing else in that file changes.

## 5. `scripts/apply-clo-patch.ts` (writes to Mongo over the seed)

Do not repair it: it writes wrong pairs (IEA 32 to BSA 32, 65A to 62(2), 65B to 63(4), CrPC 41C to 37(2)) over whatever the seed holds. Retire it: delete the file and any `package.json` script or doc line that names it. If anything else references it, stop and tell me. **Priya, for the founder's morning list:** any database that already ran this script, or was seeded from the old tables, holds the wrong pairs (the section routes read them). After T-250 and T-255 merge, those databases are reseeded from the corrected tables. Arjun owns the reseed.

## 6. `sections.routes.test.ts`

Correct the fixtures to the table: IEA 45 pairs with BSA 39(1), IEA 32 pairs with BSA 26. Approved as "tests that encoded a wrong pair". List each in the merge note.

## 7. `court-rules/cjm_generic.json`

| Where | Replace | With |
|---|---|---|
| L13 `jurisdictionNote` | `Chief Judicial Magistrate — jurisdiction under S.16 BNSS. Tries offences punishable with imprisonment up to 7 years.` | `Chief Judicial Magistrate (S.10 BNSS). May pass any sentence authorised by law except death, imprisonment for life or imprisonment for a term exceeding seven years (S.23 BNSS).` The rest of the sentence (powers of remand, first bail hearing, supervisory authority) stays |
| L55 | `CJM has jurisdiction over offences punishable up to 7 years (S.16 BNSS).` | `A CJM may pass any sentence authorised by law except death, imprisonment for life or imprisonment for a term exceeding seven years (S.23 BNSS).` |

Golden snapshots of this court rule: if one moves, list it for me (the court-rules snapshots are never auto-updated).

## 8. `courts/indian-courts.json`

The CrPC sections on metropolitan areas and Metropolitan Magistrates (CrPC 8, 16 to 19) are repealed in the BNSS. Replace the three notes:

| City | Replace | With |
|---|---|---|
| Ahmedabad (L4070) | `Ahmedabad is a metropolitan area under S.16 BNSS; CMM exercises powers analogous to a CJM in non-metropolitan districts.` | `Ahmedabad was a metropolitan area under the CrPC (proceedings pending before 1 July 2024), where the CMM exercises powers analogous to a CJM. The BNSS has no metropolitan areas; the designation of the city's criminal courts is as the State notification gives it.` |
| Bengaluru (L4828) | `Bengaluru is a metropolitan area under S.16 BNSS; CMM exercises powers analogous to a CJM.` | `Bengaluru was a metropolitan area under the CrPC (proceedings pending before 1 July 2024), where the CMM exercises powers analogous to a CJM. The BNSS has no metropolitan areas; the designation of the city's criminal courts is as the State notification gives it.` |
| Chennai (L5778) | `Chennai is a metropolitan area under S.16 BNSS; CMM Egmore exercises powers analogous to a CJM.` | `Chennai was a metropolitan area under the CrPC (proceedings pending before 1 July 2024), where the CMM Egmore exercises powers analogous to a CJM. The BNSS has no metropolitan areas; the designation of the city's criminal courts is as the State notification gives it.` |

Other metropolitan-area notes of the same kind (search `metropolitan`): list them for me; do not change.

## Marks

| Item | Mark |
|---|---|
| The 35 "X BNSS (was Y CrPC)" pairs that already match | Approved, no change |
| Everything above, word for word | Approved |
| Any other old BSA or BNSS number found later | Comes to me |

Signed: Ajay (CLO), 12 Oct 2026 IST.
