# T-678 — Written statement can never be drafted: the date-conflict gate dead-ends (Anushka Blocker 5; regression)

Status: building (vishal), paused for T-668b, 29 Oct 2026. P1 regression from T-650. Part A committed on fix/t-678-ws-gate-dead-end.

## Acceptance criteria
1. Both WS runs ended at: "The draft gives 15.06.2025 as the Date of service of summons on defendant, but your facts give it as the Additional pleas… Which is right?" The facts were summons 05.10.2026 and repayment 15.06.2025, and the brief showed 5 October 2026. The gate confuses two different dated facts.
2. Fix the cross-check so each date is matched to its own field. If it does ask, the user can answer in place, not only "Back to the brief".
3. A recorded-reply test with Anushka's WS inputs (fictional) produces a draft. No Ink is charged on any gate stop (already true; keep it).

## Added 29 Oct (Arjun, Ajay 25c55c73)
- Root cause: the fact-verifier cue stems include party-role words ("defend"). Rule: stems come from the noun phrase minus party-role, court-role and generic words, and a unit test checks that no template's cue list has a role word.
- A P2 text-held date with no role cue in its draft sentence passes. A new signed P2 question line.
- A withheld draft logs runId, templateId, rule and keys (no user text) and sets the optional Generation.failure {code, rule, keyA, keyB}.
- A golden WS two-date case (summons 05.10.2026, repayment 15.06.2025).
- The second exit button is T-678b.

## Mode
Full chain (drafting), legal content (Ajay).
