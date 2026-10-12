# T-335 — Two places where the fact ledger and the brief can disagree

| Field  | Value |
| ------ | ----- |
| Phase  | 1 — Describe and draft |
| Owner  | Arjun (mechanism). Lead (build, drafting) |
| Mode   | Small fix |
| Status | Building: mahak (12 Oct 2026), then T-334 |

## Problems

1. The advocate answers "Not known" on a key that the description had filled. A later re-read brings the description fact back, because `carryOver` only carries `asked` facts.
2. Since T-147b, a `keep` value from an earlier brief is not written to a new ledger after a description edit.

## Acceptance criteria

1. An advocate's "Not known" survives a later re-read of the description.
2. A `keep` value carries into the new ledger after a description edit.
3. Tests for both.

## Arjun (12 Oct 2026): mechanism, option B

1. **B.** `overlayBrief` in `fact-ledger.service.ts`, called by `writeReceptionLedger` after `holdDescriptionNone` + `carryOver`, so the ledger matches the brief by construction. No change to web, routes, shared types or the version seal. Only brief items whose source is `'user'` (the advocate's own typed or chosen value) or `asked_empty` are overlaid; anything the brief got from the model is never written as an advocate fact.
2. **"Not known" survives a re-read** (AC1 wins over T-150 Rule A for this case): it stays until the advocate removes it. Reason: the web cannot tell a newly stated value from the old text, and the safe direction for a legal draft is not to assert a fact the advocate declined. Rule A still applies to real answers (a value replaced by a contradicting new description).
3. **Arrays skipped**, as today. 4. **Unreadable keep value: no write**, description fact stays, brief shows `please_check`, as today.
5. Tests: after a description edit, every non-array key has the same state in ledger and brief (one property test over the bail fixtures); "Not known" + re-read mentioning the fact → still "Not known", not re-asked, no blank row; typed value + re-read with a different value → typed value kept as an `asked` fact.
