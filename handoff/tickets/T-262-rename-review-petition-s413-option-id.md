# T-262 — Rename the review_petition option id from s413 to s403, with a read-time alias

| Field          | Value |
| -------------- | ----- |
| Phase          | 1 — Describe and draft |
| Owner          | Lead (build). Ajay (his preference, signs the diff). Arjun (the generic alias code) |
| Mode           | Small fix. Legal content (`review_petition.json`) plus drafting code |
| Status         | To do. Unassigned. Follow-up to T-248, raised by shashank and Ajay, 12 Oct 2026 |
| Depends on     | T-248, T-240 (avoid two edits to the same pack at once) |

## Problem

In T-248 the `review_petition` option id `hc_criminal_s413_bnss` stays as an internal id, with the right section (S.403) in the visible text. Ajay prefers the id itself to say s403, so a reader of the pack isn't misled.

## Acceptance criteria

1. The option id becomes `hc_criminal_s403_bnss`.
2. A generic read-time alias maps an old stored value to the new id (it must also map the two old discharge_application enum values: `summons_case_by_magistrate_s272` → `warrant_case_by_magistrate_complaint_s268` and `s_272_bnss_summons_magistrate` → `s_268_bnss_warrant_magistrate_complaint`, from T-248) for drafts saved earlier. It lives in the shared option-validation code, so it works for any renamed option and not only this one.
3. One test per alias: a stored draft with an old id still loads and reads as the new one (review_petition and both discharge values).
4. No other change to the pack. Ajay signs the diff.
