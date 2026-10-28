# T-644 — O.39 cause title shows {plaintiff}/{defendant} unfilled on prod

Status: Built, READY 28 Oct 2026 (00684c1b); merging in slot.

## Problem
The drafting log shows `System placeholder "{plaintiff}"/"{defendant}" unfilled (temporary_injunction_o39, cause_title)`. An advocate can see an O.39 draft whose cause title still has raw placeholders.

## Acceptance criteria
1. The O.39 cause title fills the plaintiff and defendant from the held facts.
2. If either fact is missing, the T-611/T-637 gate asks for it. A raw `{plaintiff}` or `{defendant}` never reaches the draft or the editor.
3. A test reproduces the logged case using fictional data only.
4. This touches legal content (an O.39 template or renderer), so Ajay signs off.


## Follow-ups (28 Oct 2026, from T-644 review)
- An older O.39 brief without confirm_missing_party_keys enables Confirm, and the server then refuses (no Ink). Arjun to rule: keep absent=[] or fall back to the local check.
- A ledger party held as "Not known" clears the block (intake-brief.ts:1386 ledgerGivenKeys). Ajay to rule whether M2 Q2 covers the ledger path.
- No end-to-end service-to-screen test.
- The partition, replication and written-statement parties are in T-650.
