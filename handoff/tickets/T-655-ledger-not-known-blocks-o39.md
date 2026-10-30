# T-655 — A ledger-held "Not known" must not clear O.39 required items

Status: Merged into develop_staging (2e5a34ed), 29 Oct 2026. Ajay AJ-655-BC2 at 96a9340d.

## Problem
When the fact ledger holds a party as "Not known", that clears the O.39 party block (intake-brief.ts ledgerGivenKeys ~1386). The brief-text path is already caught.

## Acceptance criteria
1. A §(j)3 non-answer is no fact on every path. A ledger-held non-answer for plaintiff_name, defendant_name, main_suit_relief or restraint_sought does not clear the block, and the signed ask shows.
2. One copy of the non-answer list (FR-5a).
3. Tests for each of the four keys via the ledger path, with fictional data.


## Follow-ups (29 Oct 2026, from T-655 review)
- The brief-text path on non-O.39 packs uses isEmpty, not the non-answer check, so it disagrees with the ledger path (fails safe).
- form-ledger.ts keeps its own NO_FACT_ANSWERS / NEVER_FILLED_ANSWERS lists (FR-5a debt).
- The ten-question cap can hide relief and restraint in a full O.39 brief.
- T-654's refetch for an absent field.
