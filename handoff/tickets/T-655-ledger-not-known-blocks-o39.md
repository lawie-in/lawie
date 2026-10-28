# T-655 — A ledger-held "Not known" must not clear O.39 required items

Status: backlog. Ajay AJ-644-M3 (af6fb9e8), 28 Oct 2026, a T-644 follow-up. Legal content: Ajay signs off.

## Problem
When the fact ledger holds a party as "Not known", that clears the O.39 party block (intake-brief.ts ledgerGivenKeys ~1386). The brief-text path is already caught.

## Acceptance criteria
1. A §(j)3 non-answer is no fact on every path. A ledger-held non-answer for plaintiff_name, defendant_name, main_suit_relief or restraint_sought does not clear the block, and the signed ask shows.
2. One copy of the non-answer list (FR-5a).
3. Tests for each of the four keys via the ledger path, with fictional data.
