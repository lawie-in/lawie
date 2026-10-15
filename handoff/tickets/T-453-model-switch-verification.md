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
