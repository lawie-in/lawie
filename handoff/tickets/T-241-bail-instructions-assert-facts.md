# T-241 — Bail pack instructions make the Drafter assert facts not in the brief

| Field          | Value |
| -------------- | ----- |
| Phase          | 1 — Describe and draft |
| Owner          | Ajay (writes and signs the text). Lead (build). Anushka (verdict) |
| Mode           | Rule first (Ajay), then build, full chain. Legal content |
| Status         | To do. Waits for Ajay's signed text. Raised by Ajay, 12 Oct 2026, during T-237 |
| Gate           | Blocker for `feature.fact_ledger` with real users |
| Depends on     | T-237 (same pack files) |

## Problem

Same defect that T-136 fixed for `bail_regular`:
- `bail_anticipatory` prompt instruction 2 makes the Drafter state facts the brief doesn't hold.
- `bail_before_magistrate` instruction 4 and its `triple_test` clause do the same.

Also a low-risk follow-up from Ajay: in `bail_regular`, the "before" cue is weak.

## Acceptance criteria

1. Ajay writes and signs the replacement text for each instruction and for `triple_test`. The lead applies it word for word.
2. Test for each pack: a brief without the fact → the draft carries `{{MISSING}}` or leaves the fact out, and never states it.
3. Ajay rules on the `bail_regular` "before" cue: tighten it now, or leave it as a later follow-up.
4. Moved golden snapshots are listed for Ajay before merge; CI green on drafting.
