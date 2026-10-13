# T-393 — Bail drafts never print "S/o {{MISSING…}}" for a woman

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (drafting) + Ajay |
| Mode   | Small fix (legal content) |
| Status | Building. Kunal, after T-379. RELEASE GATE (Anushka run 3, T-359 AC6). Priya, 13 Oct 2026 |
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
