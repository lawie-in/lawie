# T-470: Calibrated date confidence (code-computed, not self-reported)

| Field  | Value                                                                    |
| ------ | ------------------------------------------------------------------------ |
| Status | Blocked: after T-403. Post-v1. Branch develop_staging (v1 code path, not v2). Priya, 15 Oct 2026 |
| Owner  | Lead (build), Arjun (design), Ajay (legal-content gate)                  |
| Mode   | Full chain                                                               |

## Source

Arjun, 15 Oct 2026, from Vishal's T-453 report. The model reports its own confidence for each date and the fact ledger holds anything under a 0.9 floor. That number is not calibrated: in the T-453 table every 0.85 read was correct, yet four right dates were held back.

## What

Replace the model's self-reported date confidence with one computed in code, so a correct date is not held back and a doubtful one is. Input: the confidence table in Vishal's T-453 report (scripts/golden-set/lib/calibrate.ts).

## Gate

Ajay. It changes which dates reach the ledger, so it changes what appears in a draft.

## Acceptance criteria (draft, Arjun to confirm)

- Confidence is computed in code from stated signals (label, format, agreement with the source text), not read from the model.
- Before/after table on every date fixture of the golden set, sent to Ajay.
- No wrong-valued date reaches a draft that did not before.
- Ajay's ref in the merge body.

## Out of scope

The date-label strip (T-469).

## Added 16 Oct 2026 (Arjun's ruling on T-498)

"In custody since" stays asked for v1 (AC5 of T-147b stands), because the extractor's confidence is not calibrated and the brief placing the same date from the same words is the same extractor agreeing with itself. When this ticket calibrates confidence (with Ajay), revisit storing a single-value date as a fact when the extractor reads it at low confidence and the brief placed it from the same words (Tanvi's proposed fix in fact-ledger.service.ts). v1 only pre-fills the ask with the brief's date as a one-tap suggestion.
