# T-393 — Bail drafts never print "S/o {{MISSING…}}" for a woman

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (drafting) + Ajay |
| Mode   | Small fix (legal content) |
| Status | Merged into develop_staging 3b0fdf2 (kunal, 13 Oct 2026). Ajay signed dff323f5, 17845087, 7c2f1d24. Waiting for Anushka on develop. Memo of parties and affidavit are T-396. Priya |
| Source | T-359 AC6, Ajay signed dff323f: "the relation defaults to a blank, never S/o" |

## Problem

The template assembles a literal "S/o {{MISSING: Father's / Husband's Name}}" for every party, including a woman. It appears in:
- the Magistrate verification;
- the regular and anticipatory cause titles;
- the default_bail verification.

This is code-assembled template text (template-engine / ADR-021), outside D1. T-373 pins it as a known failing case.

## Acceptance criteria

1. The relation word comes from the party's data: S/o, D/o or W/o as given. When it isn't given, the relation is a blank, never S/o. This is Ajay's signed line from T-359.
2. It's correct in all four places above, on both the D1 path and the legacy path.
3. Turn Vishal's pinned T-373 case into a passing test, and add a case for a woman applicant in each pack.
4. Ajay checks the template text he signs, under the legal-content paths.

## Ajay (13 Oct 2026, T-359 AC6 addendum)

- The cause title gets the blank too.
- When a name is given with no relation, print "[To be confirmed: relation] {name}".
- Add an optional question, "Relation to the person named below" (S/o, D/o, W/o, H/o). The name label becomes "Name of father, mother or spouse".
- Also fix interim_bail, surrender_application and suspension_of_sentence.

Priya: everything is in T-393. Part 1 is the engine and cause titles. Part 2 is the pack JSONs, the question and the three extra packs, after Mahak's T-365. Both go in one merge, unless part 1 is ready well before Mahak merges; then part 1 merges alone.
