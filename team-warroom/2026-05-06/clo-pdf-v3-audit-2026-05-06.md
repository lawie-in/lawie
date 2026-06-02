# CLO Audit — Anticipatory Bail PDF v3 (Jharkhand HC)
Date: 2026-05-06
Reviewer: Ajay (CLO)
File: /Users/abhinavanand/Files/Lawie/team-warroom/2026-05-06/sample-bail-jharkhand-hc-v3.pdf

## VERDICT
**NOT court-fileable.** Section 103(1) BNS = murder; narrative shows victim taken alive to hospital. Filing-killer hallucination still present.

---

## 1. SHIPPED TODAY vs PENDING (per visible diff + git HEAD = 233de6b "fix ai generation pipeline")

| Visible fix | Ticket | Status |
|---|---|---|
| Watermark removed | SCRUM-60 | SHIPPED |
| `{current_year}` -> 2026 | SCRUM-61 | SHIPPED |
| Markdown asterisks gone | SCRUM-60 | SHIPPED |
| Duplicate "Sessions Judge" caption gone | SCRUM-62 (partial) | SHIPPED |
| Strong Good-Samaritan narrative | prompt tuning | SHIPPED |
| Disclaimer prints twice on last page | SCRUM-62 | PENDING |
| Para 1 cause-title repetition | SCRUM-62 | PENDING |
| BNS section ↔ fact pattern validator | SCRUM-64 | PENDING |
| PS name normaliser | SCRUM-63 | PENDING |
| Annexure pack | SCRUM-65 (proposed, not filed) | NOT FILED |
| Separate notarised affidavit page | SCRUM-66 (proposed, not filed) | NOT FILED |

---

## 2. OPEN ISSUES

| # | Issue | Ticket | Severity | Fix path | Blocked by |
|---|---|---|---|---|---|
| 1 | BNS 103(1) (murder) on Good-Samaritan facts where victim is alive | SCRUM-64 | BLOCKER | Section/fact validator + advocate-confirm step before generation | SCRUM-64 not shipped |
| 2 | FIR `091/2021` dated `06.01.2026` mismatch | NEW (SCRUM-67 to file) | BLOCKER | Form-side regex: FIR year suffix must match FIR date year, else flag | New ticket |
| 3 | Disclaimer repeated (body + footer) | SCRUM-62 | RISK | Prompt sanitiser strip + render footer only via PDF template | SCRUM-62 in flight |
| 4 | PS "Chanri" vs "Chanho" (Chanho is the real Ranchi PS) | SCRUM-63 | RISK | Whitelist-based PS normaliser; "Chanri" not in Jharkhand PS list | SCRUM-63 in flight |
| 5 | Para 1 verbatim repeats cause-title (full address, age, FIR, section) | SCRUM-62 | RISK | Prompt rule: cause-title fields must NOT recur in para 1 | SCRUM-62 in flight |
| 6 | 7 mandatory annexures missing (Memo, Synopsis, Dates, Index, Vakalatnama, Court Fee, Affidavit) | SCRUM-65 (proposed) | BLOCKER for filing | Annexures pack generator | Ticket not filed |
| 7 | Verification on same sheet as prayer; no notarised affidavit page | SCRUM-66 (proposed) | BLOCKER for filing | Force pagebreak + separate affidavit template | Ticket not filed |
| 8 | Enrollment No. blank for advocate | minor | ACCEPTABLE | Pull from advocate profile on render | none |

---

## 3. FIR 091/2021 dated 06.01.2026 — verdict

**Read:** Most likely form-input bug, possibly compounded by AI not flagging the contradiction.

- Genuine but rare scenario exists: a 2021 FIR can produce a fresh 2026 anticipatory bail filing if the matter was dormant or applicant just learned of summons. The number suffix `/2021` is plausible historically.
- BUT the FIR-registration `dated 06.01.2026` then contradicts the suffix. An FIR's "dated" line = registration date. If reg date is 2026, suffix must be `/2026`.
- Conclusion: input drift — user typed FIR no. for an old case but used today's date as reg date. AI did not catch.

**Recommendation:** Add a soft-block validator at form layer:
- If `FIR_year_suffix != year(FIR_date)`, surface inline warning: "FIR number year (2021) does not match registration date year (2026). Please confirm." Do not auto-correct.
- File this as **SCRUM-67 (FIR consistency validator)**.

---

## 4. SHIP PLAN — v4 to court-fileable

**Must close before v4 is filing-grade:**
- SCRUM-64 (BNS validator + section/fact sanity) — BLOCKER
- SCRUM-62 (prompt hardening: strip duplicate disclaimer + cause-title dedupe in para 1)
- SCRUM-63 (PS normaliser w/ Jharkhand whitelist)
- SCRUM-67 (FIR year-vs-date validator) — NEW, file today
- SCRUM-65 (annexure pack) — needed for actual courtroom filing
- SCRUM-66 (separate affidavit page w/ notary block)

**Realistic ETA:**
- v4 with SCRUM-62/63/64/67 closed (legally safe, no annexures): **48–72 hours** if Vishal has bandwidth.
- v4 filing-grade with annexures pack (SCRUM-65/66): **5–7 days.**

**Friday Ranchi "design preview" framing:**
- HOLDS. v3 is presentable as a *design + drafting preview* (no watermark, clean typography, strong narrative) — but only if Abhinav verbally frames it as: "this is the draft engine output; the BNS section was a wrong test input we have already caught; annexures pack ships next week."
- Do **NOT** hand the Jharkhand advocate v3 as a "ready-to-file specimen". The 103(1) on a non-fatal fact pattern will torpedo credibility on first read.

**Ready for next task.**
