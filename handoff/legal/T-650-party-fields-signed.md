# T-650: party fields in plaint_partition, replication and written_statement (Ajay, CLO)

Signed 29 Oct 2026. Legal content: pack JSON only (`apps/drafting/src/config/document-rules/`). Answers Tanvi's Explore questions 1–6 on fix/t-650-party-fields.

| # | Ruling |
|---|---|
| 1 | replication: add required `defendant_name`, label `Defendant full name`, validation line `defendant_name must not be empty`. Signed. |
| 2 | written_statement: add required `plaintiff_name`, label `Plaintiff full name`, validation line `plaintiff_name must not be empty`. Signed. |
| 3 | plaint_partition: see (3a)–(3d). |
| 4 | Ask lines: AC2 says "the same ask lines as T-644", so the signed AJ-644-M1 lines (EN/HI) are the target. Whether they ship in T-650 or a follow-up is Priya's call, not mine. Interim (a) is acceptable only if the required field blocks generation, so no "_____" cause title is ever delivered. |
| 5 | brief-party-fields.ts counterpart stays NONE for these 3 packs in T-650. Changing it is a separate ticket, and it needs my sign-off. |
| 6 | Non-answers as a party on these packs: out of T-650. AJ-655-M1 already covers the ledger path in every pack. |

## (3) plaint_partition cause title

- (3a) New required field `defendant_name`, label `Defendant No. 1 full name`, validation line `defendant_name must not be empty`. `defendants_details` stays as is, with its label and its validation line.
- (3b) New required field `other_defendants`, yes/no, label `Are there defendants besides Defendant No. 1?`.
- (3c) Cause title, when `other_defendants` = yes: `{defendant} & Ors. ... Defendants`. When no: `{defendant} ... Defendant`. The style is the literal `& Ors.` (ampersand, space, "Ors."). Do not use "& Others" or a numbered list in the title.
- (3d) "& Ors." is never printed unconditionally. A partition suit can have a single defendant, and the title would then misstate the parties. If the cause-title format cannot take a condition through config, T-650 stops at 1–2 and (3) needs a code change, re-scoped with Priya. Report back before building it.

Why: Order VII Rule 1 CPC requires the plaint to give the name, description and residence of each defendant. In a partition suit every co-sharer is a necessary party. The full particulars stay in `defendants_details`. The title names Defendant No. 1, with "& Ors." added only when other defendants exist.

## Conditions

- C1: tests use fictional placeholder parties only (as in AJ-655-BC2). No realistic names.
- C2: golden snapshots are edited by hand only, and the diff goes to Priya and to me.
- C3: no other text, field or order change in these three packs. I byte-check the pack JSON diff before naming an approved SHA. Nothing merges before I name one.

## (3e)–(3g) Follow-up rulings (29 Oct 2026, on Tanvi's build of (3))

- (3e) The condition goes through `computed_fields`: `{defendant}{defendants_title_suffix}`, giving ` & Ors. ... Defendants` for yes and ` ... Defendant` for no. Signed as smoke-rendered.
- (3f) Option labels for `other_defendants` (ids stay `yes` / `no`, T-473): `Yes, there are other defendants` / `No, Defendant No. 1 is the only defendant`. Signed.
- (3g) `other_defendants` gets `"blocks_confirm": true`. An unanswered field must never fall back to the singular title. Signed ask line, EN: `Say whether there are other defendants to continue.` HI: `आगे बढ़ने के लिए बताइए कि क्या अन्य प्रतिवादी भी हैं।` If the line needs code (the AJ-644-M1 path), the interim rule in (4) applies: config-only blocking is acceptable, and the line follows with the M1 lines.
