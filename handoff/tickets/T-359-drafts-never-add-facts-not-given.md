# T-359 — Drafts never add facts the advocate did not give

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (drafting) + Ajay (sign the prompt and check changes) |
| Mode   | Full chain |
| Status | To do. RELEASE GATE for main (Anushka FAIL). Unassigned. Priya, 13 Oct 2026 |
| Source | Anushka run 3 FAIL, 13 Oct 2026 (handoff/quality/2026-10-13-run-3-develop-FAIL.md). Failed entries: T-189, T-241, T-251, T-341, T-237 |

## Acceptance criteria

1. Bail drafts (regular, anticipatory, default, Magistrate) add no antecedents, roots, character, "law-abiding", "no history of fleeing", custody-length or any ground the advocate did not give. If a point is needed and not given, it is a blank, or left out (Ajay rules which).
2. Every ground the advocate gave appears in the draft. None is dropped silently. The brief shows the grounds as given, not "[To be confirmed]".
3. A section entered twice prints once.
4. Default bail with "will furnish bail bonds" = No prints no bond undertaking. It shows the blank the brief promised.
5. A point that is both stated and blank in the same draft (Magistrate bail: "no earlier application") is one or the other. When the description gave it without the question being asked, the advocate gets a check-before-filing warning.
6. Verification uses the right relation for the party (no "S/o" for a woman; W/o or D/o as given, else a blank).
7. The Magistrate bail draft states the BNSS 480 proviso for women correctly (Ajay's wording).
8. A golden-set case for each of 1–7, from Anushka's reproduce steps.
9. Ajay signs the prompt and check changes before merge (legal content).

Anushka's reproduce steps are in the run 3 report; use them as the test cases. Anushka re-tests on develop after merge.

## Note

Check overlap with T-187/T-188 (the fact-ledger rules) before Explore.
