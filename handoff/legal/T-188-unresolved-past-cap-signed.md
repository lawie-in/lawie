# T-188: unresolved ledger items past the question cap (signed)

Signed: Ajay (CLO), 12 Oct 2026 IST.

## Choice: Option A (mark), using the existing blank

Every unresolved item past the cap of 10 is never filled with Reception's value. It prints where its value would go as the same blank the Drafter already uses for any missing fact (`{{MISSING: label}}`, from T-338, rendered as the draft's usual blank).

Reasons:

- No extra round, so no added friction.
- One blank form throughout the draft, so the advocate sees every gap the same way and no new legal string is needed.
- T-338 already prints optional unresolved keys this way.

Conditions:

1. The item stays in `unresolved` with its reason, and the brief lists it as outstanding (AC4, AC7). The brief and the Drafter get the same set.
2. Partly resolved list or choice keys (Priya's case, T-189): the resolved entries print as facts, and the unresolved entry prints as its own blank in the same list. A list is never shown as complete when an entry is missing.
3. The label in the blank is the item's signed label, never the extracted (guessed) value.
4. The rule is the same with the ledger on and off.
5. Any golden snapshot that moves comes to me before it is updated. No prompt text changes without my diff sign-off (AC9).

Mark: **Approved** (Option A). Arjun owns the design.

## Addendum 1 (12 Oct 2026 IST)

Arjun's design (528da94) is approved: Option A, with the T-338 `{{MISSING: label}}` blank as the one marker for required keys, optional keys and partly filled lists. Signed.
