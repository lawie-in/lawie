# T-411: court picker shows only courts the template allows

Status: todo (design in: handoff/marketing/consumer-court-picker-spec-t411.md, Rajesh spec, Madhuri strings, 13 Oct; waits for Ajay to sign the level names, the NCDRC label and the no-match line)

Owner: unassigned

## Why
T-410 part (a) makes the consumer complaint print "[To be confirmed: Consumer Commission]" when a non-Commission court is picked. The picker still offers every court, though, and NCDRC (type "tribunal", India) can't be reached at all.

## Acceptance criteria
1. courts.routes.ts takes a template filter and returns only courts the template's court_levels allow.
2. In the web CourtPicker and DynamicFormRenderer, a consumer complaint lists District, State and National Commissions only.
3. NCDRC is reachable, labelled as Rajesh's design says.
4. Other templates' pickers are unchanged.

## Gates
- Rajesh's design (via Meera): handoff/marketing/consumer-court-picker-spec-t411.md. It adds an always-visible level group (District / State / National Commission (NCDRC)); National has no state select.
- Ajay signs the level names, the NCDRC label and "No Commission is listed for this state yet."
- Full chain, because it touches more than one service (drafting and web).
