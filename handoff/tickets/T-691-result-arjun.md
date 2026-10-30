# T-691 — Blind A/B result and decision (Arjun, 30 Oct 2026, 13:05 UTC)

Key opened by Arjun after Anushka's and Ajay's scores were in. Key file sha256 `27f5d4ca…cc011f` matched the console line; branch `ab/t-691-run-20261030` @ ccb73b28.

## Key
Opus 5.5: D01, D02, D05, D06, D07, D09, D10, D12, D14, D16. Sonnet 5.5: D03, D04, D08, D11, D13, D15, D17, D18, D19, D20.

## Quality (Anushka class / Ajay preference)
| Matter | Opus | Sonnet | Anushka | Ajay |
|---|---|---|---|---|
| O.39 TI Patna | D01 Blocker | D15 Blocker | Sonnet reads better | Opus |
| Anticipatory bail Gaya | D02 Minor | D11 Minor | tie | tie |
| WS Mysuru | D07 Major | D03 Major | Opus reads better | Sonnet (slight) |
| Bail Hinglish Bhopal | D16 Blocker | D04 Blocker | Sonnet (D16 worse) | Sonnet (slight) |
| Bail surrendered Patna | D05 Major | D20 Major | tie | tie |
| Partition Ludhiana | D06 Major | D18 Major | tie | Opus |
| Regular bail Patna | D09 Major | D08 Major | tie | tie |
| Declaration Lucknow | D10 Blocker | D17 Blocker | Opus (D17 worse) | Opus |
| Partition Patna | D12 Blocker | D13 Major | **Sonnet, one class** | Opus |
| Quashing Patna HC | D14 Major | D19 Blocker | **Opus, one class** | Opus |

Blockers by Anushka's class scores: 4 drafts each arm (Opus D01, D10, D12, D16; Sonnet D04, D15, D17, D19). Ajay's legal read: 4 blockers in total across the 20 drafts, all invented facts, on 3 drafts — D19 (Sonnet) 1, D10 (Opus) 1, D17 (Sonnet) 2; no invented case law. Only 2 of 10 matters differ by a class, one each way. Ajay prefers Opus on 5 (argued civil matters), Sonnet slightly on 2, ties 3. No matter is fileable in either arm; the faults are shared pipeline faults (facts dropped to {{MISSING}}, uninstructed reliefs, raw form answers, template garbles).

## Cost (Vikram)
Opus mean ₹18.7 vs Sonnet ₹6.8 per draft (2.8×, ~1.6× output tokens); Opus over the Ink price cap on 5 of 10 matters, all argued packs. Fails the cost half at current prices.

## Decision
**Sonnet 5.5 stays the drafter.** Opus shows a mild edge on argued civil matters in Ajay's read, not in Anushka's class scores, with equal blocker counts, and fails the cost rule outright. Not worth a price rise on this evidence. Revisit only after the shared pipeline faults are fixed (they dominate both arms) and with n ≥ 3 per matter.

## Follow-ups (next month, deferred list)
1. Pipeline faults shared by both arms — Ajay's list of 30 Oct and Anushka's "common to both arms"; the {{MISSING}} fact-drop is the biggest and is checked first against the A/B harness path (Shashank).
2. Repricing: O.39 1 → 2 Ink; Partition 2 → 4–5 Ink (Vikram, founder's call).
3. Branch `ab/t-691-run-20261030` deleted after Vikram commits his cost table. The test key expires within a day; the founder deletes it from the cloud environment and from the prod env file.

## Harness check (Shashank, 12:58 UTC) — where the facts went
The harness writes no brief of its own: it calls the real routes in-process (POST /intake/brief → /intake/brief/update with fixture answers → /generate-from-brief), the same path as scripts/golden-set and the web's OneFlow generate call. Fixtures carry facts only as free-text `description` plus a few `answers`; the extractor has to read amount, heirs, defence etc. out of the text. Many `{{MISSING}}` placeholders are for facts the description does give (per-fixture list in Shashank's message of 12:58). One real difference from prod: the harness posts as `GOLDEN_SET_USER_ID`, for which `isSwitchOn()` returns true, so **`feature.fact_ledger` is forced ON** ("Drafter drafts from this ledger only"); the env default is off. If prod's `feature.fact_ledger` AppSetting is off, Anushka's 5g/5h prod runs drafted from `values` without the ledger — which would explain clean prod drafts and equal fact loss in both arms here.

Consequences: (1) the A/B decision stands (both arms equal under the same path; cost fails anyway); (2) **the fact-ledger path loses given facts between extraction → ledger → paragraph facts and must not be switched on in prod until fixed** — next month's first drafting item, with the T-691 fixtures as its test set; (3) also a `grounds_for_bail` answer replaces the extracted value instead of merging (golden 24 lost the civil-dispute ground).

**Prod flag check (Nikhil, 13:06 UTC, read-only via doc v24 `env-flag`):** AppSetting `feature.fact_ledger` row does not exist; env `FEATURE_DEFAULT_FACT_LEDGER=on` on the prod box → **prod IS on the fact-ledger path for everyone.** So the harness path equals prod. Arjun's reading: the remaining difference is that prod users answer the app's follow-up questions for facts the extractor missed, while the harness answers only the fixture's few `answers` keys — unanswered questions render as `{{MISSING}}`. If confirmed (Shashank checking the code), the defect is **extractor recall** (users retype facts they already described), a UX/quality defect, not a prod outage, and Anushka's clean 5g/5h runs are consistent with it. **No prod flag change** on this evidence. Next month: measure extractor recall on the T-691 fixtures (facts in description vs facts in ledger) before any fix.
