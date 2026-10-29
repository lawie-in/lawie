# T-660 — The brief can show a derived custody date that generation then refuses

Status: merged into develop_staging 3bf05b39 (tanvi, CI 1244 green), 29 Oct 2026. Follow-up: T-665.

## Problem
The brief can't read the ledger's own extracted wording, so it may show a derived "(date of arrest)" date that generation refuses. It's a display mismatch only: a wrong date is never printed.

## Acceptance criteria
1. updateBrief (apps/drafting intake.service.ts) uses the same ledger-extracted values that generation uses, so the brief and the draft agree.
2. Tests: a case where the ledger wording differs from the description wording shows the same result in the brief and in generation.
3. Legal content (bail): Ajay signs off.
