# T-683c: Apply Ajay's courtesy-tail rule (AJ-683-M2) to the v2 non-answer checks

Status: backlog (small, one lead, own release). Raised 30 Oct 2026 by Arjun. Legal paths, so Ajay checks the bytes.

## Why
AJ-683-M2 says the rule applies everywhere the non-answer check runs. T-683 wires it into v3 only. The v2 checks still treat "pata nahi sir" or "Not known ji" as a real value on the brief path. Changing that changes prod behaviour, so it ships on its own.

## Acceptance criteria
1. isEmptyOrNonAnswer, isPartyNonAnswer and isNoFactAnswer strip one or more trailing tail words (Ajay's AJ-683-M2 list, Latin and Devanagari) for the check only, then apply the existing rules.
2. Reuse the single signed helper in signed-confirm-messages.ts that T-683 adds. No second copy of the list.
3. "Ramesh Bhai" and "Not Known Traders" still pass. Ajay's test rows in the T-511 file all pass.
4. Ajay checks the merged SHA.

## Depends on
T-683 merged (the helper lives there).

- Ajay AJ-671-M2 (30 Oct): add the temporal fillers to the same tail list (yet, as yet, abhi, abhi tak, as of now, at present, currently, for now, अभी, अभी तक). "not known yet" is a non-answer.
