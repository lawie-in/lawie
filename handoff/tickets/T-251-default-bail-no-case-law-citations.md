# T-251 — default_bail tells the Drafter to cite case law and count days

| Field          | Value |
| -------------- | ----- |
| Phase          | 1 — Describe and draft |
| Owner          | Ajay (writes and signs the text). Lead (build). Anushka (verdict) |
| Mode           | Rule first, then build. Legal content |
| Status         | Ajay signed the text (handoff/legal/T-251-default-bail-text-signed.md, 64e1e70). URGENT, live legal error: the pack puts offences that "may extend to 10 years" in the 90-day period (correct: 60 days), and validation_rules enforce it, which delays a default-bail claim by 30 days. Moved ahead of T-245a (Priya, 12 Oct): next for mahak after T-194. T-245a builds on it afterwards |
| Gate           | Blocker for `feature.fact_ledger` with real users |

## Problem

`default_bail.json` `prompt_context` names four judgments, with citations, and tells the Drafter to cite them:
- Uday Mohanlal Acharya;
- Sanjay Dutt;
- Bikramjit Singh;
- Rakesh Kumar Paul.

It also asks the Drafter to count days. That conflicts with T-148 (no case law on its own) and T-136 (no facts not in the brief).

## Acceptance criteria

1. Ajay's replacement text is applied word for word.
2. Test: a draft cites no judgment the advocate didn't give, and states no day count the brief doesn't hold.
3. Golden snapshots that move are listed for Ajay.
