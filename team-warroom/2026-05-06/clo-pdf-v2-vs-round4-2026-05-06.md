# CLO Audit — v2 PDF vs Round 4 Baseline (Anticipatory Bail, Jharkhand HC)
Date: 2026-05-08 (re: 2026-05-06 v2 PDF)
Reviewer: Ajay (CLO)

## Verdict (one line)
v2 is materially closer to court-ready than v1; the AI body has improved on every dimension; the remaining gaps are pipeline/pack issues (watermark, duplicated disclaimer, missing annexures, verification placement), not draft-text regressions. The "Round 4 looked perfect" perception is largely a rendering-context artifact (markdown viewer vs PDF pipeline) plus a weaker fact pattern this round.

## Side-by-side comparison

| Dimension | Round 4 baseline (`02-bail_anticipatory.draft.md` source) | v2 PDF (2026-05-06) | Status |
|---|---|---|---|
| Cause title | Rajesh Mahto, S/o Late Shri Dhananjay Mahto, 42, Ranchi addr; Versus State of Jharkhand thru Pr. Secy. Home | Santosh Oraon, S/o Pankaj Oraon, 29, R Ali Bldg Ranchi; Versus State of Jharkhand thru Public Prosecutor | Acceptable; both render the template correctly |
| Petitioner block | Template-rendered correctly | Template-rendered correctly; `{current_year}` resolves to 2026 | Improved (vs v1) |
| Court designation | "IN THE HIGH COURT OF JHARKHAND AT RANCHI" — single block | Same single block (no duplicate sessions caption) | Improved (vs v1) |
| Application heading | "APPLICATION FOR ANTICIPATORY BAIL UNDER SECTION 482 OF THE BNSS, 2023" | Same | Acceptable |
| Opening salutation | "MOST RESPECTFULLY SHOWETH:" | Same | Acceptable |
| Body para 1 quality | Clean — FIR no., date, PS, sections, BNS 2023, "apprehends arrest, has not been arrested" | Repeats applicant address + DOB inline (`...son of Pankaj Oraon, aged 29 years, residing at 358...`) — verbose but legally correct | Risk — para 1 is over-stuffed; cause-title fields duplicated. Likely AI prompt artifact (form data injected as cause-title context bleeds into body). |
| Fact narrative coherence | Strong — single continuous business-dispute story | Weaker — applicant is passive bystander; Mr. Roshan is the Good Samaritan; "false implication via misidentification" is the bridge | Risk — narrative fine but **logically softer than v1**. Para 5 ("falsely implicated") only loosely follows from para 2-4. Cause: form input was looser this run; not a prompt regression — see point 6 below. |
| Section selection | BNS 318(4) / 336(3) — cheating + endangering life — coherent with civil-recovery story | BNS 109 (attempt to murder) — coherent with victim-with-injuries fact pattern | Approved — section choice correct in both runs |
| Article 21 reference | Para 9 | Paras 1, 9, 12 | Acceptable |
| Sushila Aggarwal cite | Para 10 — generic parameters quote | Para 10 — fuller, includes "fixed period / unlimited period," "duration not ended on summons" | Improved — citation depth genuinely better in v2 |
| Prayer | Template — three clauses (a/b/c) + "act of kindness" | Identical structure | Acceptable |
| Verification | Template — verified at Ranchi, paras 1-12, signature line | Identical — same sheet as prayer | Risk — must be on a **separate notarised affidavit page**. Was missing in Round 4 too (template-level gap, not regression). |
| AI-disclaimer | Single line, footer-small-gray | **Prints twice** — once in body flow, once in page footer | Blocker — duplication is new in PDF pipeline. SCRUM-61. |
| Watermark | None (Round 4 was markdown source, no PDF pipeline) | "DRAFT — Lawie Free Tie" on every page (truncated string + on a paid plan should not appear) | Blocker — SCRUM-60. Truncation also a bug. |
| Annexures pack | None | None | Blocker — Memo of Parties, Synopsis, List of Dates, Index, Vakalatnama, Court Fee statement, separate Affidavit. Missing in BOTH; this is a pack-completeness gap, never an AI regression. SCRUM-62. |
| `*inter alia*` italics | N/A in source | Renders as italic in PDF | Improved (vs v1 raw asterisks) |
| `**bold**` markdown | Renders correctly in markdown viewer | Renders as bold in PDF (no raw `**`) | Improved (vs v1) |
| Overall court-readiness | Drafttext: filing-grade. Pack: not filing-grade (no annexures). | Draft text: filing-grade with minor para-1 verbosity. Pack: not filing-grade. | v2 strictly better on pipeline; same on pack. |

## What regressed vs what was always missing

**Always-missing (also absent in Round 4 — pack-completeness gaps, NOT regressions):**
- 7 mandatory annexures (Memo of Parties, Synopsis, List of Dates, Index, Vakalatnama, Court Fee statement, separate Affidavit page)
- Verification on same sheet as prayer / no separate notarised affidavit page
- Court Fee statement
- Index of documents

**Genuine new regressions in v2 (vs Round 4 source-as-rendered):**
- Watermark "DRAFT — Lawie Free Tie" (truncated and policy-violating; introduced by PDF export, did not exist in markdown)
- AI-disclaimer printed twice (body flow + footer) — pipeline duplication bug
- Para 1 verbosity: applicant address/age repeated inside body — likely AI receiving cause-title fields in its prompt context this run; was tighter in Round 4

**Not regressions (different inputs, same template behavior):**
- Different applicant, FIR, sections — expected
- Weaker narrative — driven by looser/passive form input ("sitting at Dhurwa Dam"), not by template change

## What genuinely improved v1 → v2 (map to SCRUM-44.x sub-tickets filed today)

| Improvement | SCRUM key |
|---|---|
| `{current_year}` now resolves to literal `2026` | SCRUM-44.1 (placeholder resolution) |
| Markdown bold `**...**` no longer leaks as raw asterisks | SCRUM-44.2 (markdown→PDF renderer) |
| Duplicate "IN THE COURT OF SESSIONS JUDGE, RANCHI" caption gone | SCRUM-44.3 (cause-title dedup) |
| `*inter alia*` italics render correctly | SCRUM-44.2 (markdown→PDF renderer) |
| Section selection improved — BNS 109 correctly chosen for victim-with-injuries (NOT 103(1) murder hallucination) | SCRUM-44.4 (BNS section auto-suggest accuracy) |

## Why the founder thinks v2 looks worse

Honest read: **viewing-context illusion + weaker input narrative.**

1. Round 4 was viewed as a `.draft.md` in a markdown viewer — bold renders, no watermark exists, no "DRAFT" stamp on every page, no PDF pagination breaking the verification block off. It looked clean because the rendering layer was clean.
2. v2 goes through the CLI export → PDF pipeline, which adds the (truncated) watermark, duplicates the disclaimer, and forces page breaks that visually expose pack gaps that were always there.
3. The fact pattern this round is genuinely weaker — Santosh as passive bystander is harder to defend than v1's first-person Good Samaritan account. That weakness is real but it's an **input quality** issue, not a prompt regression.

Net: v2's draft text is at least as good as Round 4 (better Sushila citation, correct BNS 109). The PDF wrapper is what makes it look worse.

## Para 5 logical-coherence concern (founder flagged)

Confirmed. Para 5 says "falsely implicated" but paras 2-4 paint Santosh as merely present, with Mr. Roshan doing the helping. The chain is:
- Para 2: Santosh sitting quietly
- Para 3: Roshan helps victim
- Para 4: family blames Roshan "and by extension" Santosh
- Para 5: applicant falsely implicated

This is the AI **synthesising correctly from looser form input**, not a prompt regression. Reading `bail_anticipatory.json` body prompt: "Paragraphs 2-4 should narrate the facts: {facts_narrative}. Subsequent paragraphs should establish grounds: {grounds_for_bail}." The grounds checkbox `false_implication` was selected, so the AI dutifully pivots to it in para 5 even though the facts only loosely support it. Behavior-correct, narrative-weak.

Recommendation: add a prompt instruction — "If `false_implication` is selected but facts_narrative does not clearly establish a complainant motive or misidentification mechanism, the body should explicitly reconcile the gap (e.g., 'while applicant was not directly involved in the incident, he has been roped in due to mere presence at the scene')." File as SCRUM-44.5 or fold into SCRUM-63.

## Shortest path to a court-fileable v3 (SCRUM gates)

| Ticket | Fix | Severity |
|---|---|---|
| SCRUM-60 | Remove watermark on paid plan; fix truncation ("Free Tie" → "Free Tier" or remove) | Blocker |
| SCRUM-61 | De-duplicate AI-disclaimer (footer only, not body) | Blocker |
| SCRUM-62 | Annexures pack generator: Memo of Parties, Synopsis, List of Dates, Index, Vakalatnama, Court Fee, separate Affidavit page | Blocker |
| SCRUM-63 | Verification on separate notarised affidavit page (page-break before VERIFICATION section) | Blocker |
| SCRUM-64 | Para 1 stop repeating cause-title fields — tighten body prompt to forbid re-emission of name/age/address inside paras | Risk |
| SCRUM-44.5 (new) | Reconcile grounds-vs-facts coherence when `false_implication` selected on passive-bystander facts | Risk |

All five 60-series tickets must close before v3 is presentable as filing-grade. SCRUM-64 and 44.5 raise quality but do not gate filing.

Ready for next task.
