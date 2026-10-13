# T-373: DRAFTER_D1_SYSTEM_PROMPT (signed)

Signed: Ajay (CLO), 13 Oct 2026 IST. Build 11ba566 (Vishal), diff SHA-256 prefix `ec397d47e42e3d2f`. Only `DRAFTER_D1_SYSTEM_PROMPT` is added. The signed PACK, REPAIR, GUIDED and FACT_REPAIR prompts are untouched.

Approved with one change, to clear a conflict: the Magistrate `grounds` clause is both `source: advocate` and `list: true`. Rule 3 gives it item text, but rule 4 says "empty text". Rule 4's opening becomes exactly:

`4. FIXED LIST CLAUSES. For a fixed clause with "list": true, in items, give one item for each entry of the "from" fact, in the order FACTS gives them, with factRef "<key>[<n>]" (n counts the entries of that key from 0) and empty text. Give no item for anything FACTS does not hold. Leave factRefs and text empty. An advocate clause with "list": true follows rule 3.`

Rules 1, 2, 3, 5 and 6 are approved as written, including rule 3's one-item-per-entry line. With this change made and "PROPOSED" removed, the prompt is signed. Any later edit needs a fresh sign-off.
