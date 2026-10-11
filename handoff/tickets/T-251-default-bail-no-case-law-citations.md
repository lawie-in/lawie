# T-251 — default_bail tells the Drafter to cite case law and count days

| Field          | Value |
| -------------- | ----- |
| Phase          | 1 — Describe and draft |
| Owner          | Ajay (writes and signs the text). Lead (build). Anushka (verdict) |
| Mode           | Rule first, then build. Legal content |
| Status         | Chain complete: mahak, 9e094ef. Ajay approved cec29ed. In the merge queue after T-200. Go-live gate: feature.fact_ledger ON for real users |
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

## Known gap, accepted (Priya, 12 Oct 2026)

In non-ledger mode (feature.fact_ledger off) nothing checks the Drafter's text against the bond box, so a body saying "the applicant will not furnish bail bonds" is not stopped. The averments ban applies only with the ledger on. Accepted: the ledger path is the v1 path, and fact_ledger stays off for real users until T-187, T-188, T-190 and T-194 are done. Pinned as `it.failing` in the t251 test; it turns red the day it is fixed.

## Go-live gate for default_bail (Ajay, 12 Oct 2026)

`feature.fact_ledger` must be ON for real users before default_bail is offered to them. This is the condition on which Ajay accepted the non-ledger bond gap. Ajay approved the T-251 diff at cec29ed (recorded in handoff/legal/T-251-default-bail-text-signed.md). Cite it in the merge body.

## After the merge (mahak, 12 Oct 2026)

- `_averments/README.md` lines 3–4 still say every file there has `signed_by` null until Ajay signs. default_bail is now signed (and in `.prettierignore`). A small doc edit in Ajay's wording; it is a legal path, so he signs it.
- T-191 is closed (superseded by this ticket).
- `handoff/data/rule-pack-report.md` is generated and stale for default_bail. Regenerate it if it is kept current.
- Marketing: no default-bail post until this is merged, and then only once the go-live gate holds.
- Before Anushka's run: `feature.fact_ledger` must be ON in the develop environment, or she sees the old path and default_bail is not offered (setup in anushka-run.md).
