# T-706: Extractor model by pack price, and intake limits

Status: backlog, P1, drafting. The first drafting item next month. Raised 30 Oct 2026 by Priya from Arjun. Sources: Anushka's prod model grid (the Extractor is the lever for the lost facts) and Vikram's cost table (a Sonnet Extractor adds about ₹3.3 per intake, which would put 1-Ink packs under water). Nothing changes on prod today.

## Acceptance criteria
1. The Extractor runs on Sonnet for packs priced at 2 Ink or more, and on Haiku for 1-Ink packs: resolveModel('extractor') takes the pack price.
2. Intake limits (INTAKE_LIMITS): 10 per day for accounts that have never bought Ink, 20 per day for paid accounts.
3. Each Extractor llm_call line is tagged with its model, for Vikram's two-week cost check against ₹3.70 per Ink.
4. An ai.rates row for claude-opus-5-5: $4 in, $20 out, 5-minute cache write $5, 1-hour cache write $8, cache read $0.20. This is an admin settings row the founder can add at any time.
5. Admin INR figures show 2 decimals.

## Founder decision (30 Oct 2026, in Priya's chat): "I agree with Anushka"
Anushka's recommendation (https://claude.ai/artifact/S6uDQVcPPuPJBagdyEQURb):
- Extractor: Sonnet 5.5. With the Haiku Extractor, given facts are dropped; with Sonnet they are kept.
- Drafter: Sonnet 5.5. Haiku and Opus print raw markdown and Opus is slower.
- Fact checker: Haiku 5.5. Sonnet showed no gain.
- Fix the pipeline for the facts that every model drops (WS amounts and loan date, declaration valuation, bail "charge sheet not filed").
Open question for the founder: AC1 above (Haiku for 1-Ink packs) came from Vikram's cost table, where a Sonnet Extractor puts 1-Ink packs under water. Does "Sonnet for all packs" stand, with the 1-Ink price raised, or by pack price?

## Founder answer (30 Oct 2026): Option 1
A Sonnet Extractor for EVERY pack. AC1 is replaced: there is no Haiku Extractor for 1-Ink packs. Vikram's costing means 1-Ink packs go to 2 Ink (the minimum price becomes 2 Ink; Solo's 50 Ink buys at most 25 drafts). The founder asked Vikram for market research first, then a conclusion on the final price. The price change (billing catalogue, plus the "short ones 1 Ink" copy re-signed by Meera and Ajay) waits for that conclusion. Nothing changes on prod until the price is set.
