# T-263 — citation-check keeps a case name that starts with an initial

| Field          | Value |
| -------------- | ----- |
| Phase          | 1 — Describe and draft |
| Owner          | Ajay (writes the rule, signs). Lead (build). Anushka (verdict) |
| Mode           | Rule first, then build. Legal content (`citation-check.ts`, T-148) |
| Status         | To do. Unassigned. HIGH priority per Ajay: case law reaching a draft is a legal-accuracy risk. Found by mahak during T-251, 12 Oct 2026 |

## Problem

`citation-check.ts` removes a case citation the advocate didn't give. But a case name that starts with an initial survives:

"M. Ravindran v. Intelligence Officer … (2021) 2 SCC 485" becomes "M. Ravindran v. Intelligence Officer … [Authority — add if relied upon]".

Only the reporter reference is removed and the case name stays. Names like Uday Mohanlal Acharya or Sanjay Dutt are blanked in full. The Drafter is told not to name any judgment, and the averments ban lists M. Ravindran, so this is defence in depth. It breaks the T-148 rule all the same.

## Acceptance criteria

1. Ajay rules how a name with an initial is matched.
2. A citation like the one above is blanked in full, name and reporter.
3. Tests for names starting with an initial, with and without a full stop, and for "v." and "vs." variants.
4. Golden snapshots that move are listed for Ajay. CI green on drafting.
