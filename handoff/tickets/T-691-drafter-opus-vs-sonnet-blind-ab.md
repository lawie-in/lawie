# T-691: Blind A/B test of the drafting model, Opus 5.5 vs Sonnet 5.5

Status: DONE 30 Oct 2026. Decision (Arjun, handoff/tickets/T-691-result-arjun.md): Sonnet 5.5 stays the drafter. Opus had a mild edge on argued civil matters in Ajay's read only, the blocker counts were equal (4 each, per Arjun's result file; Ajay's legal read alone found 4 in total across all 20 drafts: D19 1, D10 1, D17 2), and Opus fails the cost rule (2.8x Sonnet). Anushka's scores: handoff/tickets/T-691-anushka-blind-scores.md. Was: tooling merged into develop_staging cd61d3dd + CI fix 39d09b7f, 30 Oct 2026. The --real run waits on the founder setting GOLDEN_SET_ANTHROPIC_API_KEY and AB_KEY_PASSPHRASE in the environment.
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

## Arjun decisions (30 Oct 2026)
1. The A/B must NOT touch prod. It runs against an ephemeral Mongo (mongodb-memory-server or a docker mongo); the fixtures are self-contained.
2. Legal-reviewer "n/a in v2" is fine.
3. Same ledger for both arms: run intake once, then generate twice (option a).
4. 6-8 fixtures in scripts/ab/fixtures; Ajay signs the facts.
5. Interleave the arms, randomise the order, report raw and uncached-equivalent cost.
No model run until Arjun reviews the harness and says go. Vikram's ₹600 cap stands.

## Arjun's two-strike ruling (30 Oct 2026): the operator
Runner = Shashank, in his own session (not a crew agent). README §Operator wording, exact:
"The runner is Shashank. He runs `--real` once with AB_ARJUN_GO=1, never opens scoring/, vikram/ or the key file, and forwards: scoring/ (drafts only, model hidden, random order) to Anushka and Ajay; vikram/ + the console cost lines to Vikram; the key file to Arjun. The holding rule (nobody holds any two of scoring, costs, key) binds the recipients until Arjun opens the key after Anushka's and Ajay's scores are in. If Shashank must open any artefact to debug a failed run, he says so in the ticket and the run is void."
Also: at the end of the run the harness prints a SHA-256 of the key file to the console, so Arjun can confirm it was not altered.
Then a fresh reviewer, and Arjun gives AB_ARJUN_GO after reading Ajay's signed fixtures.

## Run handover (Arjun, 30 Oct 2026; go given 12:25 UTC, AB_ARJUN_GO=1)
- Outputs are committed unopened to branch `ab/t-691-run-20261030`. It is never merged, and is deleted after Arjun opens the key.
- Shashank reads scoring/ only, to send the blind drafts to Anushka (she has no repo access).
- Ajay reads scoring/ from the branch. Vikram reads vikram/ (costs).
- Arjun reads the sealed key file only after both scores are in.
- Shashank sends Priya the key file's SHA-256 and the branch name for this ticket.
- Scoring falls under the 75% stop rule: if the stop hits first, the drafts keep and are scored next month.

## Run done (Shashank, 30 Oct 2026 12:45 UTC)
One --real run, exit 0. Spend ₹256.87 (below the ₹400 stop and the ₹600 cap). 20/20 drafts delivered.
- Branch: ab/t-691-run-20261030 @ ccb73b28. Never merged; Arjun deletes it after he opens the key.
- Outputs: scripts/ab/out/run-20261030/2026-10-30T12-45-00-272Z/ (scoring/, vikram/, KEY.sealed.json), committed unread.
- Key SHA-256: 27f5d4ca0824f1ed6792768a253b1d8a2e76108331cd22a70bec15c68bcc011f
- Scoring: Ajay and Anushka (scoring/), Vikram (vikram/). Arjun opens the key only after both scores are in.
