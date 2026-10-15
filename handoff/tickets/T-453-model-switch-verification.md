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
