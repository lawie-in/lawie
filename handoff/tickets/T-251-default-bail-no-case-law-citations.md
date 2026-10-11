# T-251 — default_bail tells the Drafter to cite case law and count days

| Field          | Value |
| -------------- | ----- |
| Phase          | 1 — Describe and draft |
| Owner          | Ajay (writes and signs the text). Lead (build). Anushka (verdict) |
| Mode           | Rule first, then build. Legal content |
| Status         | Building: mahak, fix/t-251-default-bail, 12 Oct 2026. Ajay signed 64e1e70 plus his interim rule. LIVE legal error |
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

## Interim rule until T-245a lands (Ajay, 12 Oct 2026)

- No `procedure_code` key yet, so the PROCEDURE CODE and GOVERNING PROVISION lines are left out of the case details.
- `{governing_provision}` in the heading and the prayer prints `[To be confirmed: Section 167(2) CrPC or Section 187(3) BNSS]`.
- The S-text and P-text go in word for word.
- T-245a later adds the key and the derived lines without touching T-251's wording.
