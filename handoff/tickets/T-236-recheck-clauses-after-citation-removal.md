# T-236 — Re-check mandatory clauses after citations are removed

| Field          | Value |
| -------------- | ----- |
| Phase          | 1 — Describe and draft |
| Owner          | Lead (build). Ajay signs (ai.service.ts is legal content). Anushka (verdict) |
| Mode           | Full chain |
| Status         | Mahak, after T-431. Ajay ruled option 1 (15 Oct): recheck findMissingClauses after every removal in the brief drafter (incl. post-verifier, always), no second repair pass, warn through the existing missing-clause channel. Priya |
| Size           | S |
| Depends on     | T-200 |

## Problem

`removeUngivenCitations` (`apps/drafting/src/services/ai.service.ts`, around line 1262) changes the body after the mandatory-clause check has run. Nothing checks the clauses again afterwards. If the removal takes out text a clause depends on, the draft can go out with a mandatory clause missing and nobody is told.

## Acceptance criteria

1. After `removeUngivenCitations` changes the body, `findMissingClauses` runs again, using T-200's rule (cues, or the R2b recorded text).
2. A clause lost in the removal goes to the repair pass. If the repair pass doesn't restore it, the advocate gets a warning, as with any other missing clause.
3. Test: a citation removal that strips a clause's cue → the clause is reported missing.
4. Golden snapshots unchanged; CI green on drafting.


## Ajay's ruling (15 Oct 2026)

Option 1, two conditions. (1) Recheck after every removal in the brief drafter: after removeUngivenCitations (~1748-1756) and after the post-verifier removal (~1833-1839), always (today it runs only when the verifier failed). Skip the other call sites (2348, 2535) unless Priya scopes them in. (2) No second repair pass (decision D3 allows one). AC2 amended: a clause lost in removal gets the advocate warning and no model call, through the existing missing-clause channel, no new event type. Warning text (Ajay): "A required clause may have been lost when a case citation you did not provide was removed from the draft. Please check the draft for: {clause names}. Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing." If the existing message already carries clause names, reuse it and append only the second sentence of that text onward. Do not name or quote the removed citation; do not say the draft is wrong or defective; logs carry names only. AC3 test covers the post-verifier removal too. A new message string is legal content and comes back to Ajay for a text check.
