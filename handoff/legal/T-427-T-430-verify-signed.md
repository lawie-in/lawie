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
