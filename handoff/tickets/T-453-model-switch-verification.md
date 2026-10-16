# T-453: Model switch verification (drafting body Sonnet 5.5, intake and preflight Haiku 5.5)

| Field  | Value |
| ------ | ----- |
| Status | To do. V1 (go-live prerequisite). Vishal, after T-441, before T-303 if the founder has set the models by then, else T-303 first. Priya, 15 Oct 2026 |
| Owner  | Vishal (build), Ajay (rules every diff), Arjun, Vikram |
| Mode   | Verification run, small fix only if (4) needs it |

## Source

Arjun, 15 Oct 2026, decided with Ajay and Vikram: body `claude-sonnet-5-5`, intake and preflight `claude-haiku-5-5`. Note: handoff/design/drafting-model-arjun-15-oct.md.

## Acceptance criteria

1. Founder has added `ai.rates` rows for both models and set the three model settings on develop (founder-blocked step, on his list).
2. `golden-set.yml` dispatched on develop with recorded replies off and the cost cap on. Every diff goes to Ajay, who rules per his signed floor (b5c6848).
3. The preflight suite and the signed-rule guard suites run against the real models, green.
4. Output tokens per call recorded before and after. If thinking inflated them, one small fix sets `output_config.effort` per call (low for intake and preflight, medium for the body) and the run repeats.
5. Result written into this ticket. Prod gets the settings with T-403 after Ajay's PASS.

## Legal

Ajay reads the diffs; no new sign-off needed unless text moves. No code change expected beyond (4).

## Arjun (15 Oct 2026) — thinking budget per Ink class (Vikram's D7 condition)

Both 5.5 models think by default and thinking is billed as output. Before phase 0 this ticket must also report, per class S/M/L (`handoff/finance/ink-classes-proposal-vikram.md`), the measured thinking tokens per call on the golden set, and settle a per-class budget: start with the lowest effort setting the SDK offers for intake and preflight (Haiku) and a capped budget for the body (Sonnet), raise only where the golden diffs get worse. The budget is then set per call in code (`ai.service.ts`), the one allowed code change from the model decision; the values go in AppSettings keys `ai.thinking.S|M|L` so they are config, not redeploys. Acceptance: p90 cost per draft per class, with thinking included, under ₹3.70 per Ink; if a class cannot get under, Vikram and the founder re-price before the class ships.

Addendum (Vikram, 15 Oct): with the judge and repair calls, M is borderline (≈ ₹3.65–3.80/Ink). If measured over ₹3.70, the order is: cut repair rounds, then prompt caching on the rules/passages pack, then move the heaviest M kinds to L. M stays priced at 2.

## Arjun (15 Oct 2026, late) — runs 56/61/64 and closing rulings

- Run 56 (defaults): 8/27, $1.00. Run 61 (intake/preflight low, body medium): 6/27, $0.62 — low effort on Haiku 5.5 cost intake quality (new "unrecognised" class). Run 64 (intake medium, preflight low, body medium, intake_extract cap 3000): 8/27, $0.69, no extract cap hits; intake out median/p90 1564/2347, body 574/1750.
- Settings now: `ai.effort.intake=medium`, `ai.effort.preflight=low`, `ai.effort.body=medium`, `ai.cap.intake_extract=3000`, `ai.cap.intake_reception=4000` (last one added as a small fix after run 64). `budget_tokens` is never sent (400 on these models).
- Date confidence: the 0.9 floor is the model's self-report, uncalibrated. Run 64: all three 0.85 reads were correct, zero wrong-valued reads, four correct dates held back by the floor. Floor stays; the table is the input to a post-v1 calibration ticket (code-computed confidence, Ajay).
- Date label strip: failed review twice (meaning changes); split out as T-469 with Ajay's field-naming rule.
- Close T-453 on run 64 + the reception-cap fix. Deliverable = the report: non-passing fixtures bucketed (content diff for Ajay / truncation / unrecognised / confidence floor), per-stage token medians for Vikram, confidence table.

## Result (Vishal, run 64, 15 Oct 2026; Priya wrote it in)

Sonnet 5.5 body / Haiku 5.5 intake verified; effort low/medium/medium; golden 8/27 at $0.69 (first real run: 8/27 at $1.00). Medians/p90 tokens out per call: intake 1564/2347, body 574/1750.

The 19 non-passing cases, by bucket:
- Content (Ajay): 1a, 04 (date not in ledger); 1b, 08, 19, 21 (s.138 drawer firm dropped, now T-471, a prod blocker); 07, 08 (fact changed, blanked); 1c, 17, 18, 25 (given fact missing); 12, 13, 14 (BNSS s.144/145 flagged and a banned phrase, repaired; Ajay allowed s.144/145 for maintenance_bnss_144 only); 23 (clause).
- Truncation: 22 (reception cap, small fix in progress).
- Unrecognised: 15 (labels, T-469); 13 ("10,000 mahina").
- Confidence floor: 05, 07, 17, 18 (T-470).
- Schema: period_expiry_date in 15-17.

Confidence table: 0.85 reads 3/3 right, zero wrong-valued reads, 4 correct dates held back by the 0.9 floor.

Ajay (15 Oct): everything in run 64 acceptable except the drawer firm (T-471). Open after this ticket: reception cap, T-469, T-470, T-471.

Vikram (15 Oct): $0.69 for 27 fixtures is about Rs 2.25 a draft, about Rs 1.1-1.3 per Ink; well under his Rs 2.60 working figure and the Rs 3.70 line. No price change; he keeps Rs 2.60 until real drafts confirm it. Ask for the record: tag cost per class (S/M) separately once the class table lands, so the monthly Rs 3.70 review has per-class p90s.

## Closed (Vishal, 16 Oct 2026, e88655e4)

Verified: Sonnet 5.5 body / Haiku 5.5 intake+preflight; effort medium/low/medium; caps reception 4000 / extract 3000 (settings); golden run 64 8/27 at $0.69; failures classified for Ajay. Open: T-469 (date labels), T-470 (calibrated confidence), T-471 (drawer firm, prod blocker).

Addendum (Arjun, 16 Oct): run 72 scored 8/29 against run 64's 8/27 on a branch with no behaviour change — the golden pass total moves by ±2 on model variance alone. Rule from here: compare runs per fixture (which fixtures flipped, and why), never by total; a change is "better" or "worse" only when the flipped fixtures are explained. T-480's faults did not reproduce with the ledger on (fixture 27 = Anushka's facts) and closed as config.
