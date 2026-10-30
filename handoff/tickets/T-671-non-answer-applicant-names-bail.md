# T-671 — A non-answer as an applicant or party name blocks Confirm in bail and the remaining packs

Status: backlog (unassigned). The rest of Ajay's AJ-668-M1 ("every pack"), 29 Oct 2026. T-668 covers the plaint packs plus replication and written statement, on both the brief and the form route.

## Acceptance criteria
1. In bail_regular, and in every other pack with an applicant or party-name field outside T-668's 8 packs, a typed non-answer ("Not known", "unknown" and the signed equivalents in the T-655 list) blocks Confirm on the brief and the form route, before any Ink hold.
2. It reuses T-668's helpers (isEmptyOrNonAnswer, partyConfirmLine). No new strings unless Ajay signs them.
3. A test per pack: a non-answer blocks, a real name passes, and nothing prints the literal non-answer.
4. Legal content: Ajay byte-checks before merge.

4. Ajay additions (29 Oct): the Hindi danda (।) is a boundary like "."; Latin Hinglish non-answers (pata nahi, maloom nahi, …); M5 also applies on the guided-brief Confirm.

## Mode
Small fix (drafting, plus web BriefStep if the screen needs it), legal content. Known gap until merged (AJ-668-M1).

- Ajay, 29 Oct 2026 (f0f0a5b5): add the first_party override line to the T-127 doc copy: "Add the name of the person this document is for, to continue."

- Ajay AJ-671-M1 (29 Oct 2026, in the T-511 file): Latin-script Hinglish non-answers (pata nahi, maloom nahi, ...) plus a courtesy-tail rule ("pata nahi sir" and "Not known ji" count as non-answers), applied in every field. One complete rule, ready for when T-671 starts.
- Ajay AJ-683-M2 (30 Oct 2026, T-511 file) REPLACES the AJ-671-M1 filler list. Applies everywhere the non-answer check runs, v3 included. Strip trailing tail words for the check only. The full Latin and Devanagari list is in the T-511 file. "Ramesh Bhai" still passes.
- Edge case (Arjun, 30 Oct): an answer edit like "not known yet" (a non-answer plus a word that is neither a courtesy word nor on the signed tail) with no candidate still reaches v2 as typed. Ajay to rule whether it is a non-answer.
- Ajay AJ-671-M2 (30 Oct): "not known yet" IS a non-answer. Temporal fillers join the tail list: yet, as yet, abhi, abhi tak, as of now, at present, currently, for now, अभी, अभी तक. "Not Known Traders" still passes. Applies on every path, including T-683c.
