# CLO Config Audit & Batch Plan — 2026-05-10
**Author:** Ajay (CLO)
**Scope:** All legal/court-config JSON in `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/` (except `bns-offences.json`, already complete)
**Mode:** PLANNING ONLY. No file edits in this pass.

---

## Headline
**23 files audited, 14 need work, 6 batches planned (~24 chunked dispatches).**

---

## Count summary

| Bucket | Files | Complete | Need work | P0 | P1 | P2 |
|---|---|---|---|---|---|---|
| A. BNS family | 3 | 1 (offences) | 2 | 2 | 0 | 0 |
| B. Section mappings (old→new) | 3 | 0 | 3 | 1 | 2 | 0 |
| C. Courts directory | 1 | 0 (stub) | 1 | 1 | 0 | 0 |
| D. Court rules | 13 | 0 | 11 | 6 | 5 | 0 |
| E. Document rules | 6 | 0 | 6 | 4 | 2 | 0 |
| **TOTAL** | **26** | **1** | **23** | **14** | **9** | **0** |

---

## File-by-file scorecard
Gold standard = `bns-offences.json` (full `_meta` block with `validated_by`, `last_updated`, `owner`, `change_protocol` + 305 entries all CLO-validated).

### A. BNS family

| File | Schema | Data | Validated | Critical gaps | Effort |
|---|---|---|---|---|---|
| bns-offences.json | A | 305/305 entries | YES (2026-05-10) | none | DONE |
| bns-mapping.json | C | 10 doc-types covered | NO — no `_meta` block, no validation flag | (1) No `_meta`/owner/last_updated. (2) "bns_offences" sub-maps are sparse and incomplete (only ~18 sections for bail; should cover all bail-relevant). (3) `injunction` and `vakalatnama` only have CPC/Advocates Act — no BNS refs. (4) Missing doc types: rent_agreement, consumer_complaint, legal_notice_s138, bail_anticipatory_specific. (5) Section 436 listed under bail_application — that's BNSS S.479 in new code, audit. | M |
| bns-bailability.json | C | 89 non-bailable + 78 bailable = 167 entries | NO — `_comment` present but no `validated_by`/`last_updated` block | (1) bns-offences.json has 305 entries; bns-bailability covers only 167 — gap of ~138 sections. (2) No `_meta` block. (3) No coverage of compoundability or cognizability (those exist in bns-offences — could cross-validate). (4) S.436 BNSS — wrong code reference in `_comment` (says "S2"). (5) No sub-clause coverage for many sections that bns-offences distinguishes. | M |

### B. Section mappings

| File | Schema | Data | Validated | Critical gaps | Effort |
|---|---|---|---|---|---|
| ipc-to-bns.json | B | ~302 IPC sections mapped of 511 (59%) | NO — `validated_by: "Pending CLO review"` | (1) ~209 IPC sections still unmapped (40%). (2) `validated_by` flag still pending. (3) Most entries have no `notes` field for legal nuance. (4) Several IPC sections (e.g. S.13-16 definitions) skipped without comment. (5) `new_provisions` block lists only 6 of ~30+ BNS-new sections. | L |
| crpc-to-bnss.json | B | 187 CrPC sections mapped of 484 (39%) | NO — Pending CLO review | (1) ~297 CrPC sections unmapped (61%). (2) `new_provisions` lists only 7 of ~50+ new BNSS provisions. (3) No `notes` field on most entries. (4) Missing entire chapters: search & seizure, summary trials, juvenile, sentencing details. | L |
| iea-to-bsa.json | B | 182 entries (165 IEA mapped of 167 + 17 new) | NO — Pending CLO review | (1) Coverage is good (~99%) but `validated_by` still pending. (2) `new_provisions` only lists 2 of ~6 genuinely new BSA provisions. (3) One known bug already documented as fixed (IEA S.32 → BSA S.32). Need second pass to catch similar errors. (4) BSA section numbers for electronic evidence (S.61-63) need cross-validation. | S |

### C. Courts directory

| File | Schema | Data | Validated | Critical gaps | Effort |
|---|---|---|---|---|---|
| indian-courts.json | B | 42 courts (Bihar 11, Jharkhand 9, Delhi 8, UP 10, Consumer 4) | NO — no `_meta` block at all | (1) No `_meta`/`validated_by`/`last_updated`. (2) Missing courts: Bihar (Saharsa, Purnea, Katihar, Madhubani, Sitamarhi), Jharkhand (Deoghar, Giridih, Palamu, Dumka), UP (Allahabad/Prayagraj, Gorakhpur, Bareilly, Aligarh, Noida-GBNagar). (3) NO Delhi District Courts beyond Saket — Tis Hazari/Karkardooma listed but no Karkardooma/Rohini/Dwarka district-judge entries (only sessions). (4) No NCDRC / NCLT / DRT / NGT for tribunals. (5) Supreme Court missing entirely (used for SLPs). (6) No `pincode`/`district_code`/`address` fields — useful for cause-title autofill. | M |

### D. Court rules (13 files)

| File | Schema | Data | Validated | Critical gaps | Effort |
|---|---|---|---|---|---|
| patna_hc.json | B+ | 10 case nomenclatures | NO — no `_meta` | Solid content. No `_meta`/owner. Missing: stamp/court-fee schedule reference, Synopsis/List of Dates rule, paper-book pagination rule. | S |
| jharkhand_hc.json | B+ | 9 case nomenclatures | NO | Same shape as Patna HC. No `_meta`. Missing PIL rules, mining-special-court note. | S |
| delhi_hc.json | A- | 11 nomenclatures | NO | Best of the HC trio. No `_meta`. Missing IPR/Commercial Suit format details, court-fee differential, hard-copy filing window specifics. | S |
| allahabad_hc.json | A- | 9 nomenclatures + Lucknow Bench districts | NO | Strong. No `_meta`. Missing Sunday/Vacation Bench rules, Synopsis format. | S |
| bihar_district.json | B | 6 nomenclatures | NO | No `_meta`. Generic local rules — needs Bihar-specific: court-fee values, vernacular Hindi rule (S.272 BNSS), pleader fee. | M |
| jharkhand_district.json | B | 6 nomenclatures | NO | Near-duplicate of bihar_district. No `_meta`. Needs Jharkhand-specific local rules — particularly Santhali/Hindi script rule, mining-area courts. | M |
| delhi_district.json | B | 6 nomenclatures | NO | No `_meta`. Sub-court-complex differences not captured (Saket vs Tis Hazari vs Patiala House have small format differences). e-Filing process not detailed. | M |
| up_district.json | B | 6 nomenclatures | NO | No `_meta`. UP-specific: Hindi-mandatory rule (1947 Order), separate Lucknow vs western UP, women's court rules. | M |
| cjm_generic.json | B | 6 nomenclatures | NO | Good content. No `_meta`. Missing: cognizance order format, complaint case sub-procedure. | S |
| jmfc_generic.json | B | 5 nomenclatures | NO | Thinner than CJM. No `_meta`. Missing summons-trial vs warrant-trial differentiation, S.223 BNSS complaint examination protocol. | S |
| sessions_generic.json | B | 4 nomenclatures | NO | Skeletal. No `_meta`. Missing committal procedure (S.232 BNSS), charge framing rules, sessions trial format. | M |
| district_court_generic.json | B | 5 nomenclatures | NO | No `_meta`. Civil-specific local rules thin — missing court-fee, summons format, Order VIII WS timeline detail. | M |
| consumer_commission_generic.json | A- | 3 nomenclatures | NO | Best content quality. No `_meta`. Missing State Commission and National Commission templates (only District). Pecuniary jurisdiction values cited correctly. | S |

### E. Document rules (6 files)

| File | Schema | Data | Validated | Critical gaps | Effort |
|---|---|---|---|---|---|
| bail_anticipatory.json | B+ | 7 mandatory clauses, full prompt | NO — no `_meta` | No `_meta`. Missing Arnesh Kumar safeguards (S.41A CrPC → S.35(3) BNSS), Sushila Aggarwal conditions detail, narcotics/PMLA carveouts. | M |
| bail_regular.json | A | 7 clauses, DV/dowry specialPrayer | NO | Strongest doc rule file. No `_meta`. Missing economic-offence carveouts, parity-with-co-accused checklist refs. | S |
| consumer_complaint.json | A | 10 clauses, jurisdiction tiers | NO | Strong. No `_meta`. Pecuniary jurisdiction tiers cite Rs.1cr / 1-10cr / >10cr which CONTRADICTS the consumer_commission_generic file that cites Rs.50L (per 21 Dec 2021 Notification). **BLOCKER — internal inconsistency on a number that goes into prayers.** | M |
| legal_notice_s138.json | A | 6 clauses, statutory timelines | NO | Strong. No `_meta`. Missing post-Dashrath Roopsingh Rathod (2014) territorial jurisdiction rule, joint-and-several liability rules for company drawers. | S |
| legal_notice_s80.json | B | 5 clauses | NO | Lean but complete. No `_meta`. Missing S.80(2) urgent leave-of-court bypass, list of who counts as "public officer". | S |
| rent_agreement.json | B | 7 clauses | NO | No `_meta`. Missing state-specific Rent Control Act refs (Bihar Buildings Control 1947, Delhi Rent Control 1958, UP Urban Buildings 1972). Stamp duty rates not state-aware. Lock-in clause missing. | M |

---

## Recommended batch plan

### Batch 1 — Fix blockers + add `_meta` blocks to BNS family — S/M, 2-3 chunks
- bns-mapping.json: add `_meta`, expand `bns_offences` sub-maps, add missing doc types, fix S.436 reference
- bns-bailability.json: add `_meta`, extend to all 305 sections from bns-offences (or cross-reference)
- **Acceptance:** Both files have `_meta` block matching bns-offences.json template; coverage matches the offences file.

### Batch 2 — Section mapping completion + validation — L, 4-6 chunks (BIG)
- ipc-to-bns.json: map remaining ~209 IPC sections; chunked by IPC chapter (3-4 chunks)
- crpc-to-bnss.json: map remaining ~297 CrPC sections; chunked by CrPC chapter (4-5 chunks)
- iea-to-bsa.json: validation second pass + complete `new_provisions` (1 chunk)
- **Acceptance:** `validated_by` flipped from "Pending" to "Ajay (CLO) — YYYY-MM-DD"; coverage >=95% for IPC and CrPC.

### Batch 3 — Resolve cross-file BLOCKER + add `_meta` to doc-rules — M, 2 chunks
- **Reconcile consumer complaint pecuniary jurisdiction:** Rs.50L vs Rs.1cr — pick one based on 2021 Notification. This blocks any consumer draft going out.
- Add `_meta` block (validated_by/last_updated/owner/change_protocol) to all 6 document-rules files
- Tighten bail_anticipatory and bail_regular with current Supreme Court safeguards (Arnesh Kumar, Sushila Aggarwal, Satender Antil)
- **Acceptance:** Single source of truth for consumer pecuniary jurisdiction; all 6 doc-rules have `_meta`.

### Batch 4 — Court rules `_meta` + state-specific local rules — M, 3 chunks
- Chunk 4a: 4 HCs (patna_hc, jharkhand_hc, delhi_hc, allahabad_hc) — add `_meta`, court-fee, synopsis rules
- Chunk 4b: 4 district court files (bihar, jharkhand, delhi, up) — add `_meta` + state-specific Hindi/court-fee/local procedure
- Chunk 4c: 5 generic files (cjm, jmfc, sessions, district_court_generic, consumer_commission_generic) — add `_meta` + plug procedural gaps
- **Acceptance:** All 13 court-rules files have `_meta` and state-specific differentiation visible in localRules array.

### Batch 5 — Courts directory expansion (Phase 1 coverage) — M, 2 chunks
- Add `_meta` block to indian-courts.json
- Add ~15 missing district headquarters (Bihar 5, Jharkhand 4, UP 6) for Phase 1
- Add Supreme Court entry + NCDRC entry (needed for consumer appeals path)
- **Acceptance:** Every Tier-2 city in Bihar/Jharkhand/UP that has a district court is in the file.

### Batch 6 — Phase 2 expansion (DEFER until paying users say so) — L
- Maharashtra, Karnataka, West Bengal, Tamil Nadu, Telangana, MP courts
- Tribunal templates: NCLT, NCDRC State Commissions, DRT, NGT, ITAT
- New document types if SCRUM tickets demand: written statement, plaint, divorce petition, FIR quash petition
- **Acceptance:** Defer to Phase 2 — do not run now.

---

## Priority ranking

**P0 — blocks the drafting product (run within next 7 days):**
- bns-mapping.json (`_meta` + sub-map expansion)
- bns-bailability.json (`_meta` + coverage parity with offences)
- ipc-to-bns.json (highest user-facing impact — every bail/quash draft hits it)
- indian-courts.json (`_meta` + Phase 1 city gap)
- consumer_complaint.json + consumer_commission_generic.json (resolve pecuniary jurisdiction contradiction)
- All 6 document-rules files (`_meta`)

**P1 — broaden coverage for Phase 1 advocate-pack scope:**
- crpc-to-bnss.json
- iea-to-bsa.json (validation second pass)
- 4 district-court state files (Bihar/Jharkhand/Delhi/UP local rules)
- 4 HC court-rules files (`_meta` + state polish)
- bail_anticipatory, bail_regular (Arnesh Kumar / Sushila Aggarwal safeguards)

**P2 — nice-to-have polish (Phase 2 candidates):**
- 5 generic court-rules files (`_meta` only)
- legal_notice_s80, legal_notice_s138, rent_agreement (state-aware refinements)
- New states / tribunal templates (Batch 6)

---

## Courts gap analysis

**States covered:** Bihar, Jharkhand, Delhi, Uttar Pradesh (all 4 Phase 1 states present).

**District-headquarters covered vs missing — Phase 1 scope:**
- Bihar: 6/38 districts. **Missing for Phase 1:** Saharsa, Purnea, Katihar, Madhubani, Sitamarhi (Mithila-belt advocate-base).
- Jharkhand: 5/24 districts. **Missing for Phase 1:** Deoghar, Giridih, Palamu, Dumka (founder's home-state demand).
- Delhi: 6 court complexes — coverage adequate. Missing district-judge civil-side mappings for non-Saket complexes.
- UP: 6/75 districts. **Missing for Phase 1:** Prayagraj/Allahabad (HC seat — embarrassing gap), Gorakhpur, Bareilly, Aligarh, Gautam Budh Nagar (Noida — large user pool).

**States missing for Phase 2 (defer):** Maharashtra, Karnataka, West Bengal, Tamil Nadu, Telangana, Madhya Pradesh, Rajasthan, Gujarat, Punjab/Haryana, Odisha.

**Court types missing entirely:**
- Supreme Court of India (needed for SLP templates)
- NCDRC + State Consumer Commissions (needed once a consumer draft goes to appeal)
- NCLT / NCLAT (corporate)
- DRT / DRAT (banking — Recovery of Debts)
- NGT (environment)
- ITAT (tax appeals)
- AFT (Armed Forces Tribunal)
- Family Courts (Bihar, UP have them — currently routed through sessions)
- Motor Accident Claims Tribunal (MACT) — high-volume tort use case
- Labour Court / Industrial Tribunal

**Recommendation:** For Phase 1 (25 paying users), add Supreme Court + NCDRC only (2 entries). Defer remaining tribunals to Phase 2.

---

## Effort total

| Batch | Effort | Estimated chunked dispatches |
|---|---|---|
| 1 — BNS family meta + maps | M | 2-3 |
| 2 — Section mappings (IPC/CrPC/IEA) | L | 8-11 |
| 3 — Doc-rules meta + consumer fix | M | 2 |
| 4 — Court rules meta + state local | M | 3 |
| 5 — Courts directory expansion | M | 2 |
| 6 — Phase 2 (defer) | XL | 8-12 |
| **Phase 1 total (Batches 1-5)** | — | **17-21 dispatches** |
| **Phase 2 total (Batch 6)** | — | 8-12 (defer) |

---

## My recommendation

**Run now (next 7-10 days), in this order:**
1. **Batch 3 first** — it contains the only true cross-file inconsistency (consumer pecuniary jurisdiction); fixing it unblocks consumer drafts going out. Plus adding `_meta` everywhere is mechanical and fast.
2. **Batch 1** — small but high-value; aligns BNS family.
3. **Batch 5** — Phase 1 city gap is more important than IPC coverage because advocates in Saharsa/Deoghar/Noida can't currently get a cause-title.
4. **Batch 4** — state-specific local rules; needed before Friday Ranchi pack expansion.
5. **Batch 2** — biggest effort, but coverage gaps in ipc-to-bns and crpc-to-bnss are gracefully degradable (the AI can still draft using sections that ARE mapped). Run after Batches 1/3/4/5.

**Defer to Phase 2 (post-revenue, after first 25 users):**
- Batch 6 entirely.
- Generic court-rules files's `_meta` (P2) can ride along inside Batch 4 if convenient.

**Total Phase 1 ask:** ~17-21 dispatches. At 1 dispatch per session, ~3 weeks of CLO chunks. At 2-3 dispatches per day, ~1 week.

Ready for next task.
