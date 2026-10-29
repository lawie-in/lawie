# T-678 — Written statement can never be drafted: the date-conflict gate dead-ends (Anushka Blocker 5; regression)

Status: backlog, P1. Source: Anushka run 5, prod v1.2.2, 29 Oct 2026 (handoff/tickets/anushka-run5-prod-v1.2.2.md). FAIL verdict.

## Acceptance criteria
1. Both WS runs ended at: "The draft gives 15.06.2025 as the Date of service of summons on defendant, but your facts give it as the Additional pleas… Which is right?" The facts were summons 05.10.2026 and repayment 15.06.2025, and the brief showed 5 October 2026. The gate confuses two different dated facts.
2. Fix the cross-check so each date is matched to its own field. If it does ask, the user can answer in place, not only "Back to the brief".
3. A recorded-reply test with Anushka's WS inputs (fictional) produces a draft. No Ink is charged on any gate stop (already true; keep it).

## Mode
Full chain (drafting), legal content (Ajay).
