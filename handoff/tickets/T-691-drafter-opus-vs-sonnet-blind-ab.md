# T-691: Blind A/B test of the drafting model, Opus 5.5 vs Sonnet 5.5

Status: backlog. Assign after T-686 merges (one lead, small). Raised 29 Oct 2026 at the founder's request. Design: Arjun, handoff/finance/drafting-model-opus-vs-sonnet.md section 5.
Budget: about ₹600 of model spend (Vikram tracks it).

## Acceptance criteria
1. The golden-set harness runs **10 matters × 2 models** (claude-sonnet-5-5 and claude-opus-5-5), both at **effort high**, on the v2 pipeline exactly as on prod, from the develop box or a cloud session.
   - 6 matters from Anushka's run 5: declaration, O.39, partition ×2, WS, bail ×2.
   - 4 argued-pack matters that Ajay picks.
2. Each of the 20 drafts records:
   - tokens in, out and cached (cassettes for Vikram);
   - fact-checker violations;
   - legal-reviewer findings;
   - placeholders left.
3. The 20 drafts are written to a scoring folder in random order with the model hidden (a sealed key file maps ids to models). Anushka scores them blind: blockers, majors, minors and "would I file it".
4. Ajay picks the 4 argued matters and confirms the rubric before the run.
5. No prod data and no user drafts. Golden matters only.
6. Output: one table per pack (score delta, cost per draft, p95) for Vikram and Arjun, then a per-pack recommendation to the founder.

## Decision rule (Arjun, proposed to the founder)
Switch a pack to Opus only if Anushka's blind score improves by one severity class or more on at least 60% of that pack's matters, AND Vikram's p95 cost stays under the cap. Otherwise stay on Sonnet and let v3 land.

## Depends on
T-684 (per-role model settings) merged; T-686 merged (slot).

## Ajay (29 Oct 2026, handoff/legal/T-691-ab-matters-and-rubric-ajay.md, 4b613f3b)
- Matters: golden 23 (regular bail) and 24 (anticipatory bail). NEW fictional fixtures for O.39 and s.528 BNSS quashing; Ajay signs their facts. Spare: 26 (certiorari).
- Rubric confirmed. Blockers also include: a wrong or invented citation, a repealed code alone, an invented fact, changed signed text, a wrong court.
- Arjun holds the A/B key. Ajay checks citations separately before the key is opened.
