# T-653 — Guard: spendCredits refuses earnedCredits

Status: merged into develop_staging 5596ec7b (kunal, CI green), 29 Oct 2026. Follow-ups: T-667.

## Problem
earnedCredits (the old login, rating and signup bonuses) can't be spent today only because `spendCredits` (drafting credits.service.ts ~602-650) has no callers. There is no guard. A future caller could spend Ink that users were never offered.

## Acceptance criteria
1. `spendCredits` (and any other spend path) refuses to debit the earnedCredits bucket unless a feature flag tied to a signed bonus scheme is on. The flag is off by default, and no scheme exists yet.
2. Tests: a spend that would touch earnedCredits is refused, and other buckets are unaffected.
3. Any future bonus scheme's offer and terms go to Ajay first.
