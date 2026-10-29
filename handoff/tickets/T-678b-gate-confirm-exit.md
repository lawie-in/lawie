# T-678b — Gate question gets a second exit: "Yes, it is the <label A>"

Status: backlog, after T-678. Design: handoff/design/T-678b-gate-question-two-exits.md (Rajesh). Copy: Ajay (25c55c73). Arjun §2 ruling (corrected after Vikram).

## Acceptance criteria
1. When the delivery gate asks "The draft gives <value> as the <label A>, but your facts give it in the <label B>. Which is right?", the user sees two actions: the primary "Yes, it is the <label A>" and "Back to the brief". Never only Back.
2. Confirming re-runs the draft with that key and value marked user-confirmed (the verifier skips it), bound to the same runId as the next runSequence.
3. Cost: the re-run is the first and only charge, at normal cost. The standard InkCostLine sits under the primary button, and "free" never appears.
4. llm-usage tags the re-run `confirmedRerun: true`. Alert if more than 3% of runs in a week.
5. Rajesh's spec acceptance lines 1-7.

## Mode
Full chain (web + drafting), legal content (Ajay), UI (Rajesh).
