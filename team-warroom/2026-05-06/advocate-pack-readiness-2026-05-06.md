# Advocate Pack Readiness — Audit
**Author:** Ajay (CLO) · **Date:** 2026-05-06 · **For:** Founder
**Question:** "Are we product-wise ready to present the document pack to advocates?"

---

## Traffic-light summary

| # | Item | Status | Evidence / Gap |
|---|---|---|---|
| 1 | 12 PDFs ready (pack itself) | RED | Smoke-test runs at `.../20260506-133018/` and `.../20260506-133324/` produce `.response.json` (SSE stream of `data: {"text":...}` chunks) and a 1-line empty `.draft.md`. **No PDFs exist.** SCRUM-44 (rich-text editor + PDF/DOCX export) is `Picked Up`, not `Done`. `apps/web/src/components/editor/exportUtils.ts` exists but is browser-side only — runs from inside the editor UI, not from CLI smoke-test output. We have no offline path from `.draft.md` → PDF today. |
| 2 | Cover sheet for advocates | GREEN | `/Users/abhinavanand/Files/Lawie/docs/jharkhand-advocate-review-cover-note.md` is solid: scope, what to flag, what NOT to flag, timeline, honorarium, confidentiality, contact. Two placeholder fields remain: `[Advocate Name]` and `₹[amount]`. |
| 3 | Per-template caveat / disclaimer | AMBER | Standard footer "AI-assisted draft — verify with applicable law before filing. Lawie does not provide legal advice." is wired in (per SCRUM-23 rules). For an advocate-review pack we need a stronger one-pager: (a) drafts are fictitious, (b) reviewer is not retained as counsel, (c) no advocate-client relationship is created, (d) reviewer's comments are received as product feedback only. 10-line addendum to the cover note. |
| 4 | Feedback form / NDA | AMBER | Cover note tells reviewer how to send feedback (email / WhatsApp / Word mark-up) but there is no structured form. Recommend a 1-page review checklist per draft (5 yes/no items + free-text box) so feedback is comparable across reviewers. NDA is **not** required (drafts are fictitious, no client data) — confidentiality clause in cover note is sufficient. |
| 5 | ToS / Privacy one-pager | RED | `/Users/abhinavanand/Files/Lawie/docs/legal/` does not exist. No published ToS, no Privacy Policy, no Refund Policy. If an advocate asks "what are your terms?" we have nothing to hand them. Acceptable for a friendly review-only conversation; **blocker before paid signup**. |
| 6 | BCI Rule 36 compliance | GREEN | Pack is positioned as "request for professional review of a software product," paid honorarium, fictitious facts, no client matter, no public marketing. This is product validation, not solicitation. Cover note correctly says "we are not asking you to opine on merits." Keep it 1:1, do not post on social media, do not name reviewers in marketing without written consent. |
| 7 | 3-line founder script | GREEN (drafted below) | — |

---

## Founder script (3 lines, when handing over the pack)

> "I'm building Lawie, an AI drafting tool for young advocates. Before I open paid access I want a senior advocate's eye on 12 sample drafts — 6 Bihar, 6 Jharkhand — across bail, notices, rent, consumer. Facts are fictitious; I'm asking you to flag hallucinations, wrong sections, and anything that wouldn't pass muster in your court. Honorarium of ₹[X] per draft, six days turnaround, all confidential. May I send the pack?"

---

## ONE recommendation

**NOT ready to ship today.** One blocker, one near-blocker, both fixable in 24-48 hours.

**Must do before sending:**

1. **Generate actual PDFs (P0 — today).** File Vishal a P0 task: ship a CLI export script `scripts/test-templates/export-to-pdf.sh` that takes a results folder, reconstructs the streamed text from `.response.json` (concatenate all `data:{"text":...}` chunks), wraps in the cover-title + filing-checklist block from each template config, and renders to PDF via `puppeteer` or `markdown-pdf`. 12 PDFs in `/scripts/test-templates/results/20260506-pack/`. This unblocks the entire ask.
2. **Add the 10-line "review terms" addendum (P1 — 30 min).** I will draft and append to the cover note today. Covers: fictitious facts, no advocate-client relationship, feedback received as product input only, reviewer indemnified for good-faith comments.
3. **Add a 1-page feedback checklist per draft (P1 — 30 min).** I'll produce a single PDF: 12 pages, one per draft, 5 yes/no items (cause-title correct? sections correct? prayer correct? verification correct? would you file this after one round of edits?) + free-text. Saves the reviewer time and gives us comparable data across reviewers.
4. **Ship a stub `/docs/legal/REVIEW-TERMS.md` (P2 — same as item 2).** Even a 1-page policy is enough to answer "what are your terms?" if asked.

**Acceptable to defer (not blockers for the review pack):**

- Full public ToS / Privacy / Refund Policy → required before paid signup, not before advocate review.
- SCRUM-44 full rich-text editor → reviewer doesn't see the editor, only the PDF output.

**Decision:** With the 4 fixes above (≈ 4-6 hours of Vishal time + 1 hour of mine), pack is shippable to Ranchi by **Friday 8 May 2026**. Without item 1 (PDFs), do **not** send — handing an advocate raw SSE JSON or empty markdown files will discredit the project in the first 30 seconds.

Ready for next task.
