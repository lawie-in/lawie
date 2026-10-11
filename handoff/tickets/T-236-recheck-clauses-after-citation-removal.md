# T-236 — Re-check mandatory clauses after citations are removed

| Field          | Value |
| -------------- | ----- |
| Phase          | 1 — Describe and draft |
| Owner          | Lead (build). Ajay signs (ai.service.ts is legal content). Anushka (verdict) |
| Mode           | Full chain |
| Status         | To do. Found by vishal during T-200, 12 Oct 2026. Starts after T-200 merges (same files) |
| Size           | S |
| Depends on     | T-200 |

## Problem

`removeUngivenCitations` (`apps/drafting/src/services/ai.service.ts`, around line 1262) changes the body after the mandatory-clause check has run. Nothing checks the clauses again afterwards. If the removal takes out text a clause depends on, the draft can go out with a mandatory clause missing and nobody is told.

## Acceptance criteria

1. After `removeUngivenCitations` changes the body, `findMissingClauses` runs again, using T-200's rule (cues, or the R2b recorded text).
2. A clause lost in the removal goes to the repair pass. If the repair pass doesn't restore it, the advocate gets a warning, as with any other missing clause.
3. Test: a citation removal that strips a clause's cue → the clause is reported missing.
4. Golden snapshots unchanged; CI green on drafting.
