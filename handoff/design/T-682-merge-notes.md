# T-682 merge notes (draft merge-commit text)

## Summary

T-682 adds the v3 typed fact ledger: a new store, one API, a read adapter for v2 ledgers, and erase steps. It sits behind `feature.drafting_v3_stage`; with the flag off, v2 runs unchanged.

- Developer, tester: built and tested on `feature/t-682-v3-typed-ledger`.
- Reviewer: round 1 and round 2 found defects (conflict readings skipped the quote check; a below-floor reading hid a real conflict). Fixed per Arjun's two-strike note. Round 3, fresh reviewer: VERDICT pass, no must-fix.
- Design: `handoff/design/T-682-ledger-schema.md` (now with an "As built" section and notes for T-685).
- Deferred: s.138 date checks, law switch and limitation are not v3 rules yet (T-685 / T-680); generation still applies them.

## What a user can now do

Nothing yet that you can see. The new fact store is switched off and no screen uses it. Drafting works exactly as before. This is groundwork: later tickets will use it so the draft only prints facts you actually gave, and asks you when two of your statements disagree.

Quality: nothing to test in the UI — flag off, no screen uses it
