# T-626: Answer the one missing fact in place when a draft is withheld

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (drafting UX) |
| Owner  | a lead (web), after T-611 and T-612 merge |
| Mode   | Full chain; Rajesh design gate |
| Status | To do. Raised 26 Oct 2026 from Vishal's T-611. Priya |

## Problem
T-611 withholds a draft that would leave a held fact blank. It shows Ajay's signed question and "Back to the brief", and takes no Ink. The user cannot answer on the failure card itself.

## Acceptance criteria
1. The failure card for fact_needed / fact_conflict shows an answer input for the one fact the gate asks for.
2. Submitting writes the answer to the ledger and re-runs the draft with no extra Ink beyond the normal draft charge.
3. Rajesh's design; any new copy signed by Ajay.
4. Tests: answer, then redraft; empty answer blocked; Back to the brief still works.
