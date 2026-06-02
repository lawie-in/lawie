# CLO Templates Batch 6 — Audit

**Owner:** Ajay (CLO)
**Date:** 2026-05-12
**Scope:** 12 property & transactional deed templates
**Category:** transactional_deed
**Court level:** [] / ["transactional"] — NOT litigation; executed between parties

---

## 1. Files filed

| #   | template_id                 | creditsCost | Primary statute                      | File path                                                                                                |
| --- | --------------------------- | ----------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| 1   | sale_deed                   | 2           | TPA S.54-55                          | /Users/abhinavanand/Files/Lawie/apps/drafting/src/config/document-rules/sale_deed.json                   |
| 2   | gift_deed                   | 2           | TPA S.122-129                        | /Users/abhinavanand/Files/Lawie/apps/drafting/src/config/document-rules/gift_deed.json                   |
| 3   | lease_deed                  | 2           | TPA S.105-117                        | /Users/abhinavanand/Files/Lawie/apps/drafting/src/config/document-rules/lease_deed.json                  |
| 4   | gpa                         | 1           | PoA Act 1882 + ICA Ch.X              | /Users/abhinavanand/Files/Lawie/apps/drafting/src/config/document-rules/gpa.json                         |
| 5   | spa                         | 1           | PoA Act 1882 + ICA Ch.X              | /Users/abhinavanand/Files/Lawie/apps/drafting/src/config/document-rules/spa.json                         |
| 6   | will                        | 1           | ISA 1925 S.59-63                     | /Users/abhinavanand/Files/Lawie/apps/drafting/src/config/document-rules/will.json                        |
| 7   | partition_deed              | 2           | HSA S.6 (post-2005)                  | /Users/abhinavanand/Files/Lawie/apps/drafting/src/config/document-rules/partition_deed.json              |
| 8   | mortgage_deed               | 2           | TPA S.58-104                         | /Users/abhinavanand/Files/Lawie/apps/drafting/src/config/document-rules/mortgage_deed.json               |
| 9   | release_deed                | 2           | TPA / HSA + Stamp A.55               | /Users/abhinavanand/Files/Lawie/apps/drafting/src/config/document-rules/release_deed.json                |
| 10  | license_agreement           | 2           | Easements Act S.52                   | /Users/abhinavanand/Files/Lawie/apps/drafting/src/config/document-rules/license_agreement.json           |
| 11  | joint_development_agreement | 2           | RERA 2016 + TPA + GST + ITA S.45(5A) | /Users/abhinavanand/Files/Lawie/apps/drafting/src/config/document-rules/joint_development_agreement.json |
| 12  | mou                         | 1           | Indian Contract Act 1872             | /Users/abhinavanand/Files/Lawie/apps/drafting/src/config/document-rules/mou.json                         |

Total credits across batch: 2x8 + 1x4 = 20 credits.

---

## 2. Schema compliance — all 12 files

- \_meta block with owner=Ajay (CLO), validated_by, last_updated=2026-05-12, change_protocol — **Present**
- template_id, docType, title, displayName — **Present**
- category="transactional_deed" — **Present** in all
- creditsCost per spec (1 for gpa/spa/will/mou; 2 for others) — **Present**
- court_levels = ["transactional"] (not court-filed) — **Present**
- causeTitle with partyDesignations + caseNomenclature="N/A — Transactional" — **Present**
- form_schema.fields — **Present**, state-aware (bihar/jharkhand/UP/delhi selectors)
- mandatory_clauses with id/name/required/description — **Present**
- prompt_context.promptInstructions (detailed legal scaffold with case citations) — **Present**
- relevantActs (multi-act with section numbers + descriptions) — **Present**
- filing_checklist (stamp duty + registration + ID + witnesses + Aadhaar/PAN) — **Present**
- validation_rules (state-aware, threshold-aware) — **Present**

---

## 3. Critical legal correctness flags embedded

| Template                    | Flag                                                                                                                                                                                                                                                                                                                       |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| sale_deed                   | Suraj Lamp v. State of Haryana (2012) 1 SCC 656 — GPA-cum-Sale is NOT valid title transfer. ITA S.50C / 56(2)(x) / 194-IA. State agricultural land restrictions: Bihar Tenancy Act, CNT Act, SPT Act, UP Revenue Code, Delhi Land Reforms Act. Vineeta Sharma — daughters' coparcenary rights.                             |
| gift_deed                   | S.122 TPA — voluntary + without consideration + acceptance during donor's lifetime. S.123 — 2-witness attestation mandatory. S.126 revocation grounds. Guramma Bhratar — Karta cannot gift entire HUF property. ITA S.56(2)(x) tax position. Mohammedan hiba carve-out.                                                    |
| lease_deed                  | Distinguished from rent_agreement (>11 months → mandatory registration S.17(d)). Anthony v. K.C. Ittoop & Sons. S.108 lessor/lessee rights/liabilities. S.111 determination grounds. TDS 194-I/194-IB. Model Tenancy Act 2021 benchmarks.                                                                                  |
| gpa                         | Suraj Lamp warning (mandatory when GPA includes sale powers). S.202 ICA irrevocable agency. S.32(c) Registration Act — GPA-holder presentation. NRI consular/apostille requirements + S.18 Registration Act 3-month re-authentication.                                                                                     |
| spa                         | Specificity rule — transaction, counterparty, consideration, scope must be identifiable. Narrow construction per S.188 ICA. Suraj Lamp where sale authorised. Auto-termination on completion.                                                                                                                              |
| will                        | S.63 ISA two-witness mandatory + S.67 bar on beneficiary witnessing. Venkatachala Iyengar — propounder dispels suspicious circumstances. Probate per S.213 ISA (mandatory for Christian/Parsi; Hindu wills in metro HC original sides). Muslim 1/3 rule + heir consent.                                                    |
| partition_deed              | Vineeta Sharma v. Rakesh Sharma (2020) 9 SCC 1 — daughters' RETROSPECTIVE coparcenary rights. HSA S.6 (amended 2005). Court permission for minor coparcener (HMG Act / GWA). S.171 ITA HUF partition recording. Owelty + family arrangement (Kale v. Deputy Director) variants.                                            |
| mortgage_deed               | All 6 types per S.58 TPA correctly classified with distinct registration / stamp / remedy rules. S.60 redemption inviolable (Pomal Kanji, Manibhai). S.69 power of sale limitations. SARFAESI for bank mortgagees. Equitable mortgage restricted to notified towns.                                                        |
| release_deed                | Substance test — release vs gift vs sale vs partition. Kuppuswami Chettiar — co-sharer release operates as enlargement. State concessional stamp for family co-sharer. ITA S.56(2)(x) relative test.                                                                                                                       |
| license_agreement           | Associated Hotels of India v. R.N. Kapoor — license vs lease test (exclusive possession + intention). S.52 / 60 / 62 Easements Act. Drafting guards to preserve license character (licensor retains possession, personal, non-transferable, revocable). S.60 proviso re investment-based irrevocability.                   |
| joint_development_agreement | RERA S.3 — mandatory registration projects > 500 sqm OR > 8 units. Faqir Chand Gulati v. Uppal — landowner is consumer. Sushila Devi v. Mohan Lal — JDA character. CBIC Notif 04/2018-CT(R) + 06/2019-CT(R) — GST reverse charge on landowner share at OC. ITA S.45(5A) — capital gains crystallisation on OC. TDS 194-IC. |
| mou                         | Binding vs non-binding clarity per S.10 ICA. Trimex International + Kollipara Sriramulu — courts pierce label. Suresh Kumar Wadhwa — conduct-based binding finding. Mandatory binding carve-outs: confidentiality, exclusivity, costs, governing law, dispute resolution.                                                  |

---

## 4. State-awareness embedded (Bihar / Jharkhand / UP / Delhi)

- Stamp duty: state schedules referenced but NOT hardcoded — every deed has language flagging "verify current state schedule" with state-wise indicators in promptInstructions.
- Agricultural land: state-specific tenancy acts (Bihar Tenancy 1885, CNT 1908, SPT 1949, UP Revenue Code 2006, Delhi Land Reforms 1954) flagged in sale_deed.
- Registration: state SR portals named (Bhumijankari for Bihar, JharBhoomi for Jharkhand, IGRSUP for UP, DORIS for Delhi).
- Rent control: state-specific acts cited in lease_deed (Bihar 1982, Jharkhand 2011, UP 2021, Delhi 1958).
- RERA: state RERA authorities enumerated in JDA.

---

## 5. Phase 1 user (Bihar/Jharkhand/UP/Delhi district-court advocate) considerations

- Transactional deeds executed at Sub-Registrar offices (not courts) — court_levels appropriately flagged ["transactional"]. Won't pollute court-level matching logic for litigation templates.
- Stamp duty + registration burden falls primarily on advocate's client; deeds include filing_checklist with concrete document list for SR appearance.
- Mandatory disclaimer reiterated: advocate is responsible for legal accuracy, due diligence on title, statutory compliance. Lawie is drafting assistant.

---

## 6. Compliance / risk register

| Risk                                                    | Severity                                                                 | Mitigation in JSON                                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| GPA-cum-sale shortcut by client                         | Blocker (Suraj Lamp)                                                     | gpa + spa: mandatory disclaimer paragraph if sale power included; validation_rules flag       |
| Unregistered sale deed presented as evidence            | Blocker (S.49 RA)                                                        | sale_deed: filing_checklist mandates registration within 4 months                             |
| Gift to non-relative > Rs.50k taxed                     | Risk                                                                     | gift_deed: validation_rules flag S.56(2)(x) ITA consequence                                   |
| Tribal land transfer in Jharkhand without DC permission | Blocker (CNT/SPT)                                                        | sale_deed + partition_deed: state-specific permission flag                                    |
| Will witness who is also beneficiary                    | Blocker (S.67 ISA)                                                       | will: validation_rules cross-check witness ≠ beneficiary                                      |
| Minor coparcener partition without court permission     | Risk (voidable on majority)                                              | partition_deed: court_permission_for_minor field + validation flag                            |
| Lease > 11 months unregistered                          | Blocker (S.17(d) RA)                                                     | lease_deed: validation_rules route < 11 months to rent_agreement template                     |
| Equitable mortgage outside notified town                | Blocker (S.58(f) TPA)                                                    | mortgage_deed: is_notified_town_for_equitable_mortgage validation                             |
| License re-characterised as lease                       | Risk (loss of stamp/registration advantage; tenancy rights for licensee) | license_agreement: licensor_retains_control validation; drafting guards in promptInstructions |
| RERA-applicable JDA project not registered              | Blocker (S.59 RERA penalty up to 10% project cost + imprisonment)        | joint_development_agreement: rera_required validation; rera_authority enumeration             |
| MOU treated as binding contract by court                | Risk                                                                     | mou: binding character validation requires unambiguous statement + carve-out list             |

---

## 7. JSON validity

All 12 files written as valid JSON — schema mirrors prior batches (sale_deed/gift_deed structure consistent with fir_quashing.json from Batch 5). Field types are correct primitives. No trailing commas, no unescaped quotes.

---

## 8. Status

**Approved.** All 12 transactional deed templates ready for Vishal's `document-rules` pipeline.

Ready for B7.
