# Drafting model — decision (Arjun, Ajay, Vikram; 15 Oct 2026)

Founder's ask, 15 Oct: "Discuss with Ajay and Vikram about the drafter model. Currently I believe we are using Haiku for that."

## 1. What runs today (as designed)

| Call | Setting | Seeded value (`docs/seeding.md`) |
|---|---|---|
| Draft body | `ai.drafting_model` | `claude-sonnet-4-6` |
| Preflight (fact check) | `ai.preflight_model` | `claude-haiku-4-5-20251001` |
| Intake (describe, brief rounds) | `ai.intake_model` | Haiku 4.5 |

The live values are admin AppSettings in the dev/prod database; only the founder can read them. If `ai.drafting_model` is a Haiku id there, it is below Ajay's floor (§3) and is corrected first.

Code check (15 Oct): the model calls send no `thinking`, `tool_choice`, `temperature`/`top_p`/`top_k`, or assistant prefill; the only option is `output_config.format` (structured outputs). A switch to Sonnet 5.5 / Haiku 5.5 is therefore configuration only. Both run adaptive thinking by default (Sonnet 5.5 effort default `high`, Haiku 5.5 `medium`); thinking tokens bill as output tokens, so the golden run measures output tokens before and after, and if they grow, one small code change sets `output_config.effort` per call (`low` for intake and preflight, `medium` for the body).

## 2. Prices (Anthropic list, USD per million tokens, input / output; cache write 2× input at 1 h, cache read 0.1× input)

Haiku 5.5 0.10 / 0.50 · Haiku 4.5 1 / 5 · Sonnet 5.5 2 / 10 · Sonnet 4.6 3 / 15 · Opus 5.5 4 / 20.

## 3. Ajay — quality floor (signed b5c6848, `handoff/legal/drafting-model-floor-signed.md`)

- Sonnet-class or above for the drafting body, every pack, notices and agreements included. **Never Haiku for the body.**
- Review for any body-model switch: one golden-set run on the real model with Ajay reading every diff (any change in a section, averment, blank, role or law-switch text fails until he rules), plus the signed-rule guard suites on the real model. Anushka's dev run stays the standing gate; no extra run.
- Opus not needed for v1; parked for SC/HC filings.
- Intake and preflight may use a cheaper model only if the preflight suite passes on it.

## 4. Vikram — cost (₹88/$, uncached, 2-Ink draft: intake 20k/3k, preflight 12k/1k, body 12k/3k; margin at full Ink use; target 60%)

| Per 2-Ink draft | ₹ | Pro yearly margin | Solo monthly margin |
|---|---|---|---|
| Today: Sonnet 4.6 body + preflight, Haiku 4.5 intake | 14.70 | 20% | 44% |
| Sonnet 5.5 body + preflight, Haiku 4.5 intake | 10.82 | 41% | 59% |
| Opus 5.5 body + preflight, Haiku 4.5 intake | 18.57 | −1% | 30% |
| Haiku 5.5 everything | 0.70 | 96% | 97% |
| **Sonnet 5.5 body, Haiku 5.5 intake + preflight** | **5.21** | **72%** | **80%** |
| Opus 5.5 body, Haiku 5.5 helpers | 9.96 | 46% | 62% |
| Sonnet 4.6 body, Haiku 5.5 helpers | 7.59 | 59% | 71% |

Monthly API spend at 18 drafts/user (100 / 500 / 2,000 users): today ₹26k / 132k / 529k; Sonnet 5.5 + Haiku 5.5 helpers ₹9k / 47k / 188k. Margin per draft does not change with scale. Moving intake + preflight to Haiku 5.5 is the largest single move (≈₹5.60 a draft). CFO recommendation: Sonnet 5.5 body + Haiku 5.5 helpers — the only Sonnet/Opus option over 60% on Pro yearly. If Opus were ever required for the body, re-tier Pro rather than absorb it. Caching not counted (headroom).

## 5. Decision (Arjun)

**Body: `claude-sonnet-5-5`. Intake and preflight: `claude-haiku-5-5`.** All three views agree. Haiku for the body is ruled out by Ajay whatever the cost; Opus is ruled out by Vikram for v1 and not needed by Ajay.

Order, no code change expected:
1. Founder (admin, develop first): add `ai.rates.claude-sonnet-5-5` = {input 2, output 10, cache_write 4, cache_read 0.2} and `ai.rates.claude-haiku-5-5` = {0.10, 0.50, 0.20, 0.01} (USD per MTok); confirm `finance.usd_inr`. **Rates before models**, or usage rows price at zero.
2. Founder sets the three models on develop. Tell Vishal.
3. Vishal (ticket from Priya): golden set, real model, on develop (`golden-set.yml` dispatch, cost cap in the script), output tokens recorded before/after; the preflight suite and the signed-rule guard suites on the real models. Ajay reads every golden diff and rules. If output tokens grew from thinking, one small fix sets `output_config.effort` per call.
4. Ajay's PASS on the diffs → the same settings go to prod with T-403. Anushka's dev run is unchanged as the gate.
5. Vikram updates the financial model; the Ink price does not move.

Not now: prompt caching option B (T-437b) and per-tier models — re-read after Anushka's run with real costUsd numbers.

## 6. Founder approval (15 Oct 2026, relayed by Vikram, ~09:00 UTC)

"Approved": Sonnet 5.5 for the body, Haiku 5.5 for intake and preflight, Ink prices unchanged; `ai.rates` rows before the switch; the verification ticket measures thinking tokens. Vikram carries the new setup in the financial model as ~₹2.60/Ink, provisional until the measured number from the verification run replaces it.
