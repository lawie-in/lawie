# T-706: Extractor model by pack price, and intake limits

Status: backlog, P1, drafting. The first drafting item next month. Raised 30 Oct 2026 by Priya from Arjun. Sources: Anushka's prod model grid (the Extractor is the lever for the lost facts) and Vikram's cost table (a Sonnet Extractor adds about ₹3.3 per intake, which would put 1-Ink packs under water). Nothing changes on prod today.

## Acceptance criteria
1. The Extractor runs on Sonnet for packs priced at 2 Ink or more, and on Haiku for 1-Ink packs: resolveModel('extractor') takes the pack price.
2. Intake limits (INTAKE_LIMITS): 10 per day for accounts that have never bought Ink, 20 per day for paid accounts.
3. Each Extractor llm_call line is tagged with its model, for Vikram's two-week cost check against ₹3.70 per Ink.
4. An ai.rates row for claude-opus-5-5: $4 in, $20 out, 5-minute cache write $5, 1-hour cache write $8, cache read $0.20. This is an admin settings row the founder can add at any time.
5. Admin INR figures show 2 decimals.
