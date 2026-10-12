# T-261 — Clause repair after check 3, and an abbreviation-aware sentence splitter

| Field          | Value |
| -------------- | ----- |
| Phase          | 1 — Describe and draft |
| Owner          | Ajay (writes and signs the flow rule). Lead (build). Anushka (verdict) |
| Mode           | Rule first, then build, full chain. Legal content (`brief-drafter.ts`, `ai.service.ts`) |
| Status         | To do. Unassigned. After T-200 merges (same files) and T-236. Raised by vishal and Ajay, 12 Oct 2026 |
| Depends on     | T-200, T-236 |

## Problem

1. **Clause repair after check 3.** Ajay's R2b.4.3 says that a clause lost to a model repair that strayed outside the flagged sentence goes "to the clause-repair pass". Today no clause repair runs after check 3: the clause is reported missing and the draft carries the starting-draft label. T-200 accepts that label (Ajay, 12 Oct 2026).
2. **Sentence splitter.** A sentence ends at `.`, `?`, `!` or `।` plus whitespace, so "No. 124" splits. That is safe (a false label, never a false pass), but it's noisy.

## Acceptance criteria

1. Ajay rules whether a clause repair pass runs after check 3, and signs the flow.
2. A clause lost after check 3 goes through that repair. If the repair doesn't restore it, the draft is labelled, as today.
3. The sentence splitter doesn't split at abbreviations: No., S., Sec., Art., Rs., v., Dr., Mr., Mrs. Tests for each.
4. Golden snapshots that move are listed for Ajay. CI green on drafting.

## Reviewer notes from T-200 round 2 (vishal, 12 Oct 2026)

1. A clause never recorded can get its first recording at check 3 from the fact-checked body: missing at check 1, repair rejected, then the fact check edits that paragraph. R2b.5 narrows this; Ajay rules whether it needs more.
2. A rejected repair candidate shares the R1.7 `notChecked` map, so a non-English commercial draft can keep an extra "not checked" warning. Separate the maps.
