# CLO PDF Audit — Anticipatory Bail Application (Jharkhand HC)
**Reviewer:** Ajay (CLO) | **Date:** 2026-05-06 | **File:** `team-warroom/2026-05-06/sample-bail-jharkhand-hc.pdf`

## 1. Verdict

**NOT court-fileable.** Blocker. Raw markdown rendering, a duplicate Sessions Judge caption, a BNS section that doesn't match the facts (S.103(1) = murder, narrative says "injuries"), and missing mandatory annexures (Memo of Parties, Synopsis, List of Dates, Vakalatnama, Affidavit, Index). Filing this as-is risks rejection at registry and damages advocate credibility.

## 2. Engineering Bug List (for Vishal — file via `/docs/inputToDev.md`)

| # | Severity | Bug | Acceptance Criteria |
|---|---|---|---|
| A1 | **P0** | Markdown `**bold**` rendering as raw asterisks | Bold renders as bold typeface; zero `**` visible in PDF body |
| A2 | **P0** | `{current_year}` placeholder unfilled | Token resolves to `2026` (or filing year) at render time; add unit test for unresolved `{...}` tokens |
| A3 | **P0** | Watermark "DRAFT — Lawie Free Tie" present + truncated | Watermark removed entirely from all PDF exports (free + paid). See policy in §4 |
| A4 | **P1** | `---` rendering literally instead of `<hr>` | Horizontal rule renders as line separator OR is stripped from prompt template |
| A5 | **P1** | `*inter alia*` rendering as raw asterisks | Italic renders as italic; covered by same markdown fix as A1 |
| A6 | **P1** | Disclaimer printed twice on last page | Disclaimer appears exactly once, in footer only; remove body-level injection |
| A7 | **P0** | Duplicate "IN THE COURT OF SESSIONS JUDGE, RANCHI" block after cause title | Block removed from prompt template `anticipatory_bail.md`; only one cause title per draft |
| A8 | **P1** | Prayer (a) reads "PS PS Chanho" | String interpolation prefixes "PS " only when not already present; output = "PS Chanho" |

## 3. Legal / Format Defect List

| # | Defect | Severity | CLO Confirmation | Fix | Where to Edit |
|---|---|---|---|---|---|
| B1 | BNS S.103(1) = Murder; facts say victim "sustained serious injuries" — no death alleged | **P0 Blocker** | Confirmed via `bns-mapping.json` line 17. S.103 is murder. Should be **S.109 (attempt to murder)** or **S.117 (grievous hurt)** depending on facts | Prompt must require user to specify "death" vs "injury" and pick correct section. Add validator: if facts mention "injury/hurt" but section is 103/105, throw warning | `apps/drafting/src/prompts/anticipatory_bail.md` + new validator in `apps/drafting/src/validators/section-fact-match.ts` |
| B2 | BNS S.301 — not in our mapping | **P0 Risk** | S.301 BNS in the actual statute = **giving false information re. offence**. Doesn't fit a Good Samaritan fact pattern. Likely hallucinated | Add S.301 to `bns_offences` block and constrain LLM to pick only from whitelist. Reject any section not in `bns-mapping.json` | `apps/drafting/src/config/bns-mapping.json` (extend whitelist) + prompt guard |
| B3 | Missing: Memo of Parties, List of Dates, Index, Vakalatnama, Court Fee, Synopsis, Affidavit | **P0 Blocker** | Confirmed against `jharkhand_hc.json` localRules (Index mandatory, Vakalatnama at first instance, Affidavit mandatory). HC registry will reject without these | Generate as separate sections/sheets in output bundle; ZIP export with: 01-synopsis.pdf, 02-memo-of-parties.pdf, 03-list-of-dates.pdf, 04-main-application.pdf, 05-affidavit.pdf, 06-vakalatnama.pdf, 07-index.pdf | `apps/drafting/src/templates/anticipatory_bail/` — split into multi-doc bundle |
| B4 | Verification on same sheet as prayer; no notary block; deponent format weak | **P0** | `jharkhand_hc.json` line 38 has correct format but it's not being honoured. HC practice = separate sheet, sworn before notary/oath commissioner | Render verification on a fresh page; append "Sworn before me / Notary Public" block | `apps/drafting/src/templates/anticipatory_bail/verification.md` |
| B5 | "MOST RESPECTFULLY SHOWETH" appears before duplicate caption — order broken | **P1** | Should sit once, immediately after cause title, before para 1 | Linked to A7 — remove duplicate caption block; "Showeth" then flows to para 1 cleanly | `anticipatory_bail.md` prompt |
| B6 | Cause nomenclature `Cr. Misc. No. _____ of {current_year}` | **Acceptable** (with fix to A2) | Confirmed correct per `jharkhand_hc.json` line 17. Jharkhand HC uses "Cr. Misc. No." for anticipatory bail | Just fix the `{current_year}` token (A2). Format itself is right | n/a |
| B7 | S.482 BNSS reference for anticipatory bail | **Approved** | Confirmed via `bns-mapping.json` line 7. S.482 BNSS = "Bail to person accused of non-bailable offence" — replaces CrPC S.438. Correct | None | n/a |
| B8 | Prayer closing "And for this act of kindness…" | **Approved** | Matches `jharkhand_hc.json` line 35 exactly | None | n/a |
| B9 | Para 1 restates address + FIR already in cause title | **P2** | Slightly verbose but not defective; HC practice tolerates this. Prefer leaner para 1 with just statutory invocation | Tighten prompt to say "do not repeat cause title fields in para 1" | `anticipatory_bail.md` prompt |
| B10 | Hindi/bilingual support | **P2 Note** | Out of scope for today; tracked in SCRUM-51. `jharkhand_hc.json` already declares `supported_languages: ["en","hi"]` | None now | n/a |

## 4. Watermark Policy (CLO — official)

**Lawie does not apply visible watermarks to any exported draft, free or paid.** A document marked "DRAFT — Lawie Free Tier" on the face of the page is unfileable, embarrassing for the advocate before the registry, and arguably violates BCI Rule 36 by branding a court submission with a vendor name. Free-tier limits must be enforced through **non-document mechanisms only**: per-month export count caps, feature gating (e.g., no DOCX, only PDF, on free), or a one-time email-gated unlock — never by defacing the work product. The only persistent on-document text Lawie may add is the footer disclaimer ("AI-assisted draft — verify with applicable law before filing. Lawie does not provide legal advice.") which is BCI/DPDP-protective and must appear once, in the footer, in small grey type.

---

**Files referenced:**
- `/Users/abhinavanand/Files/Lawie/team-warroom/2026-05-06/sample-bail-jharkhand-hc.pdf`
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/bns-mapping.json`
- `/Users/abhinavanand/Files/Lawie/apps/drafting/src/config/court-rules/jharkhand_hc.json`

Ready for next task.
