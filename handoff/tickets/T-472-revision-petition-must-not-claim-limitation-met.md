# T-472: A revision petition must not say it is within limitation when it is not

| Field  | Value                                                                 |
| ------ | --------------------------------------------------------------------- |
| Status | To do. V1 BLOCKER (Anushka run 4 FAIL, 16 Oct 2026). Priya            |
| Owner  | Mahak (writ and criminal packs), Ajay (text and gate)                 |
| Mode   | Full chain (legal content; Ajay byte-checks)                          |

## Source

Anushka, quality run 4 on develop, 16 Oct 2026: the revision petition tells the court that a petition filed 131 days after the order is within the 90-day limit and that no condonation is needed.

## What

When the filing date is after the limitation period, the draft must not state that it is within limitation or that no condonation is needed. It should leave a placeholder or carry a condonation paragraph, as Ajay rules. Check the other limitation statements in the same pack for the same fault.

## Rules

Ajay writes the exact text. Explore first (where the limitation sentence comes from: pack text, a prompt line, or the model). Ask Priya for the claim after Explore.

## Acceptance criteria

- 131 days after the order: no "within limitation" or "no condonation needed" in the draft.
- Within the period: unchanged.
- Tests for both; Ajay's ref in the merge body.

## Ajay's ruling (16 Oct 2026, T-245 file 3d906a1b; exact text is there)

- The model never says "within limitation". Code computes it from the order date, the filing date and the certified-copy date (s.12(2) Limitation Act).
- If late: print the signed delay paragraph and put a s.5 application on the checklist.
- If a date is unknown: print a blank, not a guess.
- Drop the yes/no field at criminal_revision :115.
- The same fault is possible in 19 packs: fix revision now; the rest go in one follow-up (T-474).

## Arjun (16 Oct 2026) — rounds 3 and 4, and the design change

- Round 3 passed arithmetic, Ajay's signed strings and pack fields; three regex edges remained. Rule applied: an edge that can print a wrong limitation line or silently drop a ground gets one more edges-only round; a cosmetic one goes to T-474. Edges 1–2 → round 4; edge 3 (form-path renumbering, criminal_revision has one body) → T-474.
- Round 4 fixed edges 1–2 but the new patterns replaced real ground sentences in rare phrasings ("holding that the complaint is within limitation is perverse", an earlier appeal "preferred … within the period of limitation", "launched beyond the prescribed period"). Stopped per the rule. Ajay refused shipping with any lost ground ("worse than the bug it fixes").
- Ruling (d), backed by Ajay: **no sentence replacement at all.** (1) Delete the replacement paths (IS_WITHIN_CLAIM / PETITIONER_CLAIM / BETWEEN as replacers). (2) The computed limitation paragraph renders as a template section at its signed position; Ajay's strings unchanged. (3) criminal_revision prompt gains Ajay's signed line: "Do not state whether the present petition is within or beyond limitation, or whether condonation of delay is needed; that paragraph is supplied. Grounds about limitation in other proceedings stay as the advocate gave them." (4) Detection regexes stay flag-only: a model sentence with limitation cues gets the checks-panel warning, verbatim: "Check this sentence: it states a limitation position. The limitation paragraph (para {n}) is computed from your dates." Count on the run metadata. (5) Tests: every R3/R4 triggering sentence survives byte-for-byte; the model's own in-time claims are flagged; "other proceedings" grounds may be flagged but never altered; the computed paragraph appears once; late filing + model in-time sentence = paragraph says late + warning. (6) Ajay has no record of the A/B/C criminal_revision.json edits — Mahak sends him the before/after; nothing merges until he signs. Fresh tester and reviewer. If this chain fails review it goes to the founder, not to another round.
- Retro note for T-474: four rounds on one regex family means the design was wrong; the structured limitation part replaces patterns everywhere, and T-474 inherits edge 3.
