# T-652 — Stop the silent login and rating bonus accrual

Status: backlog (unassigned). Ajay AJ-646-M9b (639892f7), 28 Oct 2026: processing with no stated purpose breaches DPDP purpose limitation.

## Problem
Users were never offered these bonuses, but the code still grants them into earnedCredits, which can't be spent:
- auth `credit-bonus.service.ts`: +2 on each daily login (`login_bonus`);
- drafting `POST /credits/rate/:docId`: +1 per draft (`rating_bonus`).

## Acceptance criteria
1. Login no longer writes `login_bonus`, and rating a draft no longer writes `rating_bonus`. The rate endpoint either goes away or records the rating with no grant. Check the web for callers before removing it.
2. Existing earnedCredits stay hidden and unspendable. A clear-down under the retention rules is a separate, dry-run-first script, run only through Arjun and Nikhil.
3. The admin credit-ledger page still reads the history.
4. Tests: login writes no ledger row, and rating grants nothing.
5. Any future bonus scheme's offer and terms go to Ajay first.
