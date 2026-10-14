# T-427 (HC and SC bail lines) and T-430 (discharge pack, BNSS entries) (Ajay, CLO, 14 Oct 2026)

Checked against court orders and status pages found by web search (sources below). These are not Gazette or registry rules. Where a line is not shown by a court record, it does not ship.

## T-427: High Court and Supreme Court bail case lines

| Court rule | Now | Ruling | Kind |
|---|---|---|---|
| patna_hc, regular and anticipatory | `Cr. Misc. No. _____ of {year}` | **Keep.** Patna HC bail and anticipatory bail orders are headed "Criminal Miscellaneous No." | n/a |
| jharkhand_hc, anticipatory | `Cr. Misc. No.` | **Change to `A.B.A. No. _____ of {year}`.** Jharkhand HC anticipatory bail orders use A.B.A. | Must-fix |
| jharkhand_hc, regular | `Cr. Misc. No.` | **Change to `Bail Application No. _____ of {year}`.** The court's regular bail case type is not confirmed, so the T-426 generic line applies. | Must-fix |
| allahabad_hc, anticipatory | `Criminal Misc. Bail Application No.` (the regular line) | **Change to `Criminal Misc. Anticipatory Bail Application U/S 482 BNSS No. _____ of {year}`**, the form on the court's status portal. | Must-fix |
| allahabad_hc, regular | `Criminal Misc. Bail Application No.` | Keep. | n/a |
| delhi_hc, both | `Bail Appln. No.` | Keep, unchanged. Not checked against a record this round, so it stays on the verify list. | Verify |
| high_court_generic, both | `_____ No. _____ of {year}` | **Change to `[To be confirmed: case type and number]`.** A blank case type breaks T-404 Rule 1. | Must-fix |
| supreme_court, both | `Bail Application No.` / `SLP (Crl.) No.` | **Bail packs must not be offered at the Supreme Court.** Bail reaches the Court by special leave petition, which is a different document. Add this to T-425's picker filter. Until then, `case_nomenclature` prints `[To be confirmed: case type and number]`. | Must-fix |

## T-430: discharge_application relevantActs (BNSS)

| Entry now | Ruling | Kind |
|---|---|---|
| `S.438 Revisional powers of HC` | **Change to** `S.438 Calling for records to exercise powers of revision (was S.397 CrPC)` | Must-fix |
| `S.442 Revisional powers of Court of Session` (wrong: s.442 is the High Court's) | **Change to** `S.442 High Court's powers of revision (was S.401 CrPC)` | Must-fix |
| (missing) | **Add** `S.440 Sessions Judge's powers of revision (was S.399 CrPC)` | Must-fix |
| S.250, S.262, S.268 discharge entries | Checked: 250 ← CrPC 227, 262 ← CrPC 239, 268 ← CrPC 245. Keep. | n/a |

The four section numbers (438, 440, 442 and the discharge sections) agree across independent sources. I have not read the Gazette text, and the descriptions above say only what each section is for.

## Sources consulted (not cited in product text)

- Jharkhand HC A.B.A.: https://www.verdictum.in/app-lite/jharkhand-high-court/abhay-kumar-mishra-v-the-state-of-jharkhand-2026jhhc18476-anticipatory-bail-1616745 ; https://order.law/library/courts/high-court-of-jharkhand/2024/september/jhhc010132452024/shubham-kumar-singh-v-the-state-of-jharkhand
- Allahabad HC: https://allahabadhighcourt.in/apps/status_ccms/index.php/view-case-detail/1106184
- Patna HC: https://app.vaquill.ai/cases/BRHC010996852025
- BNSS revision sections: https://lexibal.com/bnss-section-440-sessions-judge-powers-revision/ ; https://vakeel360.com/crpc-to-bnss/section-401-high-courts-power-of-revision ; https://lexibal.com/?p=45910
- BNSS discharge sections: https://blog.ipleaders.in/difference-between-discharge-and-acquittal-under-crpc-and-bnss/ ; https://bhattandjoshiassociates.com/continuity-of-crpc-discharge-and-framing-of-charges-under-bnss-supreme-court-judgment-in-dr-anand-rai-v-state-of-madhya-pradesh/

## T-429 scoping follow-ups (14 Oct 2026, Vishal's flags), all must-fix

1. **discharge_application :243 (the Para 10 instruction on NI Act director prosecutions) and :333 (the S.M.S. Pharmaceuticals key citation):** put both under the same s.138 gate as the NI Act entry. With no NI Act s.138 charge, neither reaches the model.
2. **:251 "S.438 BNSS revision to HC by State":** replace with `Revision against the discharge order lies under S.438 read with S.440 (Sessions Judge) or S.442 (High Court) BNSS.` This matches the T-430 table.
3. **The same strings in other packs:** quashing_528_bnss :293-297 and criminal_revision :250-252 take the T-430 descriptions word for word (438 calling for records, 440 Sessions Judge, 442 High Court). Fold this into T-429 if the claim allows, or Priya opens a small ticket.

**s.138 gate test: OK.** Use NFKC and a case-insensitive match for "Negotiable Instruments" or "N.I. Act" / "NI Act" (optional dots and spaces), plus a "138" token. A blank or placeholder charge drops the entry.

## T-428 golden (14 Oct 2026, Shashank)

**Signed: entries 1–5 and 8–16 as listed.** Only `case_nomenclature` changes. Not signed: 6–7.

| # | Question | Ruling |
|---|---|---|
| a | district_court_generic gets the REG and ANT lines | **No, keep the blank.** It is the civil district court, and T-425 removes it from every bail pack. My T-426 "`*_district`" means the state criminal-side records, not this one. Drop entries 6–7 from the batch. |
| b | Supreme Court bail lines | **Do it in T-428.** Both become `[To be confirmed: case type and number]`. T-425 also stops offering bail packs at the SC. |
| c | high_court_generic blank without `{year}` | **OK.** Exempt the exact blank string from the `{year}` data test, and nothing else. |

Any other byte in the snapshot needs a fresh sign-off.

## T-429 build notes (Vishal, 14 Oct 2026): criminal_revision and discharge

| # | Item | Ruling | Kind |
|---|---|---|---|
| 1 | discharge `key_citations` (:333) | No runtime reads it and it never reaches the model or the user, so no gate. If it is ever wired in, it comes back to me first. | none |
| 2 | Para 10 (:243) gated on the brief and template paths | Approved. | none |
| 3 | criminal_revision revision lines | Sections inverted (S.442 is the High Court, S.440 the Sessions Judge). Replace with the text below. | must-fix (T-429) |
| 4 | discharge :251, whole line replaced by the signed sentence | Approved. | none |

### criminal_revision.json signed text (byte-exact)

- :3 description: `Document-rules config for criminal_revision — Criminal Revision Petition u/S.438 read with S.440 BNSS (Sessions Judge) or S.442 BNSS (High Court) — revisional jurisdiction`
- :13 displayName: `Criminal Revision (S.438 read with S.440 / S.442 BNSS)`
- :152 description: `S.438 read with S.440 BNSS (Sessions Judge) or S.438 read with S.442 BNSS (High Court)`
- :213: `Draft a Criminal Revision Petition under S.438 BNSS (calling for records; was S.397 CrPC) read with S.440 BNSS (Sessions Judge's powers of revision; was S.399 CrPC) or S.442 BNSS (High Court's powers of revision; was S.401 CrPC).`
- :214: `BNSS provisions: S.438 — the High Court or a Sessions Judge may call for and examine the record; S.440 — Sessions Judge's powers of revision; S.441 — powers of an Additional Sessions Judge; S.442 — High Court's powers of revision; S.443 — High Court's power to withdraw or transfer revision cases.`
  (S.439 and S.527 dropped: verify.)
- :230: `Para 6: Whether appeal lay — where an appeal lies and none was brought, no revision at the instance of the party who could have appealed (S.442 BNSS; was S.401(4) CrPC); revision is residual.`
  (Today it cites "S.438(4)", which I cannot verify exists. Do not use it.)
- :241: `Choice of forum: Where the impugned order is by a Magistrate — revision lies to the Sessions Judge (S.438 read with S.440 BNSS) or to the High Court (S.438 read with S.442 BNSS), not both (S.438(3) BNSS). Where the impugned order is by a Sessions Court — revision lies to the High Court. Strategic — Sessions revision may be quicker; the High Court also has inherent powers (S.528 BNSS).`
- sections array (:249–262):
  - S.438: as T-430: `Calling for records to exercise powers of revision (was S.397 CrPC)` (already in 2fa47a1).
  - S.438(2), S.438(3): unchanged.
  - S.438(4): delete the row.
  - S.439: delete the row (verify).
  - S.440: `Sessions Judge's powers of revision (was S.399 CrPC)`
  - S.441: `Powers of an Additional Sessions Judge (was S.400 CrPC)`
  - S.442: `High Court's powers of revision (was S.401 CrPC)`
  - S.443: `High Court's power to withdraw or transfer revision cases (was S.402 CrPC)`
  - S.528: unchanged.
- :32 option values `high_court_s438_bnss` / `sessions_court_s442_bnss`: the keys may stay, but neither key text may reach the model or the printed draft. Map them to `High Court (S.438 read with S.442 BNSS)` / `Sessions Judge (S.438 read with S.440 BNSS)` wherever they are shown or sent. If the select shows raw keys today, use these as its labels.

Test: no string in criminal_revision.json pairs "S.442" with Sessions, or "S.440" with "refer", and no "S.438(4)" remains.
Sources checked: secondary texts for S.438, S.440, S.442, S.443 and S.441's heading. S.439 is still verify.

### T-429 byte check: 2fa47a1 (fix/t-429-discharge-ni-act-gate), 14 Oct 2026

| Item | Result |
|---|---|
| discharge :251 | Byte-exact with the signed sentence. Approved. |
| S.438 / S.440 / S.442 rows in discharge, quashing_528_bnss and criminal_revision | Byte-exact with the T-430 table. Approved. |
| NI Act gate (`niS138Charged`) | Approved. It needs both the NI Act name and 138, so "S.138" of another Act does not turn the NI material on. A blank or placeholder gives false. |
| Other revision lines in discharge and quashing | None left (grepped S.436–443). |
| criminal_revision :3, :13, :152, :213, :214, :230, :241, the S.438(4)/S.439/S.441/S.443 rows, :32 labels | Not in 2fa47a1. Must ship in T-429 as signed above, then a byte check of that delta. |

Merge-body ref once the delta passes: "Legal: T-429 signed by Ajay, c55d390 + this check".

### T-429 byte check: bc00d27 (criminal_revision delta), 14 Oct 2026

All signed strings from the c55d390 section are byte-exact: :3, :13, :152, :213, :214, :230, :241, the S.441/S.443 rows, the deleted S.438(4)/S.439 rows and the two option labels. The ids stay and are never sent or printed. **Approved.**

Vishal's three further findings:

| # | Item | Ruling | Kind |
|---|---|---|---|
| a | prayerTemplate "under Section {applicable_section} of the Bharatiya Nagarik Suraksha Sanhita, 2023" prints "_____": no field fills it | Fill `{applicable_section}` from `revisional_forum`: `high_court_s438_bnss` → `438 read with Section 442`; `sessions_court_s442_bnss` → `438 read with Section 440`. Printed: "…under Section 438 read with Section 442 of the Bharatiya Nagarik Suraksha Sanhita, 2023…". If the forum is somehow empty: `[To be confirmed: section of the BNSS]`, never "_____" (T-404 rule 1). Test both forums plus the empty case. | must-fix (T-429) |
| b | S.528 row "Inherent powers of HC — concurrent / residual" | Correct as is. | none |
| c | Para 7 "only one revision (to either HC or Sessions, not both)" | Correct in substance. The S.438(3) bar is on a further application by the same person; "by the same person" would be more exact. | parked |

Merge-body ref once (a) is byte-checked: "Legal: T-429 signed by Ajay, c55d390 + be9bc53 + this check".

Vishal's follow-up on (a): a value_map makes the field count for the T-135 "provision follows the court" check. **Option (i): accept the T-135 warning when no forum is chosen.** The warning is true in that case: the provision could not be stated, and the advocate must add it. The form requires the forum, so this is rare. No exception in brief-drafter.
