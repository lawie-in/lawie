# Drafting model: Claude Opus 5.5 vs Sonnet 5.5 — data for the CFO's decision (Arjun, 29 Oct 2026)

Founder's ask (29 Oct, 19:05 UTC): "test about having opus for drafting model… generate all the data so that CFO can do the calculations… and your opinion on quality". Vikram computes; Arjun gives the technical facts and the quality view; the founder decides. Nothing in prod changes until then — the switch is one AppSetting (`ai.drafting_model`; after T-684, `ai.model.drafter`), no code.

## 1. List prices (Anthropic first-party API, from the claude-api skill table cached 2026-10-06; Vikram re-checks platform.claude.com/pricing before signing)

| model                                  | id                  | input $/MTok | output $/MTok | cache write (1 h) $/MTok | cache read $/MTok                         |
| -------------------------------------- | ------------------- | ------------ | ------------- | ------------------------ | ----------------------------------------- |
| Claude Sonnet 5.5                      | `claude-sonnet-5-5` | 2.00         | 10.00         | 4.00                     | 0.10 (skill table says 0.20 — **verify**) |
| Claude Opus 5.5                        | `claude-opus-5-5`   | 4.00         | 20.00         | 8.00 (2× input — verify) | 0.20                                      |
| Claude Haiku 5.5 (intake/checks today) | `claude-haiku-5-5`  | 0.10         | 0.50          | 0.20                     | 0.01                                      |

Prod AppSettings today: `ai.drafting_model=claude-sonnet-5-5`, `ai.intake_model=ai.preflight_model=claude-haiku-5-5`, `ai.rates.*` as seeded 27 Oct, `finance.usd_inr=88`. Opus is **2× Sonnet on every token class**. Batch API (50% off) is not usable: drafts stream live.

Opus 5.5 API differences that matter (skill, model-migration): thinking cannot be disabled — effort is the only control and its **default is `medium`** (Sonnet's is `high`); forced `tool_choice` is a 400 (we don't use it in drafting); same tokenizer/context as Sonnet 5.5. Our `ai.effort.*` setting must be set explicitly for Opus or we get a different effort than today.

## 2. Per-draft token profile (prod, Nikhil's read-only pull — appended below when it lands)

Fill from §2a. Cost per draft = Σ over stages of (input×in_rate + output×out_rate + cache_write×cw_rate + cache_read×cr_rate) / 1e6 × 88 ₹/$. Today only the `body` (Drafter) stage and the delivery-gate/reviewer calls would move to Opus if `ai.drafting_model` changes; intake, preflight and Language stay Haiku. Vikram: compute three scenarios —

- **S1 Sonnet everywhere (today).**
- **S2 Opus for the Drafter only** (`ai.drafting_model` → `claude-opus-5-5`, everything else unchanged): body-stage tokens × Opus rates.
- **S3 Opus for Drafter + the gate's reviewer pass** (argued packs only: bail family, O.39, quashing, revision, appeal — the ADR's "argued" list).

## 3. Revenue and guard-rails per draft (from the ADR cost section and T-588/T-595)

- A draft costs the user 2 Ink today (typical); one Ink earns ₹9.19 net at the worst plan (Pro yearly) → **₹18.4 per draft floor**, up to ₹19–₹25 on monthly/top-up pricing (Vikram has the exact per-plan Ink value).
- Cost cap rule in prod: `ai.cost_cap_paise_per_ink = 900` → a 2-Ink draft may spend at most ₹18 of model cost before the run is refused. **If Opus pushes a draft past ₹18 the run is cut off by the cap, not just dearer** — Vikram checks S2/S3 p95 against this cap, not only the mean.
- Margin rule (ADR): never spend more on one draft than it brings in. Decision input = S2/S3 p95 cost vs ₹18.4.

## 4. Latency

- Prod generation (whole run) p50 ≈ 10 s, p95 ≈ 11 s on Sonnet (Nikhil, 29 Oct 11:28). Opus 5.5 at the same effort streams slower per token; expect ~1.5–2× on the body stage. User-visible time is dominated by intake (7–8 min, T-681), so a +10 s draft is not the UX problem today.

## 5. Quality — Arjun's opinion

**Short answer: not yet, and not globally.** Reasons:

1. The failures Anushka found (invented facts, dropped amounts, raw Hinglish copied in, stripped section numbers) are **information-flow failures**, not model-capability failures: the facts never reached the prompt as structured facts, or reached it as raw text the model copied. A stronger model guesses better; it does not get facts it was not given. Drafting v3 Phase 1 (typed fact ledger + Extractor + checker, now building) fixes that for any model. Switching to Opus before v3 would mask some symptoms in the golden set and make the v3 acceptance baseline noisy.
2. Where Opus plausibly helps: **argument quality** on argued packs (bail grounds, O.39 balance of convenience, quashing) and following Ajay's long per-pack instructions without dropping clauses. That is a real, measurable gain — on those packs, for the Drafter and the legal-reviewer pass only (scenario S3), behind the per-pack model setting T-684 ships this week.
3. Cost is 2× on the stage that is already ~90% of the per-draft spend; at today's pricing it likely crosses the ₹18 cap on long plaints (Vikram's p95 will say). The cap would start refusing runs silently unless raised, which breaks the margin rule.
4. Effort matters more than model: Sonnet 5.5 at `high` with v3's structured input is the baseline to beat; Opus 5.5 defaults to `medium`. A fair test holds effort constant.

**Recommended test (cheap, decisive, ~₹600 of model spend):**

- Blind A/B: the 6 matters from Anushka's run 5 (declaration, O.39, partition ×2, WS, bail ×2) + 4 argued-pack matters Ajay picks = 10 matters × 2 models = 20 drafts, same prompts, same effort (`high`), v2 pipeline as on prod today, run from the golden-set harness on the develop box or a cloud session (cassettes record tokens for Vikram).
- Scoring: Anushka blind (model hidden, random order) with her usual rubric per draft: blockers/majors/minors + "would I file it"; plus the golden-set checker metrics (fact-checker violations, legal-reviewer findings, placeholders left) per draft.
- Decision rule proposed to the founder: switch a pack to Opus only if Anushka's blind score improves by ≥1 severity class on ≥60% of that pack's matters AND Vikram's p95 cost stays under the cap. Otherwise stay on Sonnet and let v3 land.

## 6. What each person does

- Nikhil: token profile (§2a) — today.
- Vikram: S1/S2/S3 cost per draft (mean, p95) in ₹, vs per-plan Ink revenue and the ₹18 cap; flags where the cap binds.
- Priya: ticket the blind A/B (one lead; golden-set harness; outputs a table of 20 drafts with tokens and checker metrics; Anushka's blind scoring as the last step).
- Ajay: picks the 4 argued-pack matters and confirms the rubric.
- Arjun: reads the results and recommends per pack; founder decides.

## 7. Vikram (29 Oct 2026): cost per draft S1–S3, against Ink value and the cap

**Prices verified** on platform.claude.com/docs/en/about-claude/pricing, 29 Oct ~19:20 UTC. Opus 5.5 is **exactly 2× Sonnet 5.5 on every token class**: input $4 vs $2, 5-min write $5 vs $2.50, 1-h write $8 vs $4, cache read $0.20 vs $0.10, output $20 vs $10. Sonnet's cache read is **$0.10** (0.05× input), so the skill table's 0.20 is wrong. Haiku 5.5 is unchanged ($0.10 / $0.50, read $0.01, 1-h write $0.20, ≤100k prompts). ₹88/$.

**Basis:** §2a (prod) has not landed. These figures use **develop** body-stage rows since 15 Oct: 753 golden-set drafts plus 14 user drafts, all Sonnet 5.5. I will re-run on §2a the same day it lands. Because Opus is a flat 2×, S2 = 2 × S1 body cost exactly, before any change in thinking tokens. S3 assumes the gate's reviewer pass costs 40% of the body on Sonnet. That is my placeholder; replace it with §2a's reviewer tokens.

| ₹ per draft (body + reviewer; intake ₹0.18 extra, unchanged) | Mean | p95 | p99 | Max |
|---|---|---|---|---|
| **S1 Sonnet** (golden set / user rows) | 2.2 / 3.6 | 6.0 / 7.7 | 9.5 / n/a | 12.6 |
| **S2 Opus drafter** | 4.5 / 7.3 | 11.9 / 15.5 | 19.0 / n/a | 25.2 |
| **S3 Opus drafter + reviewer** | 6.2 / 10.2 | 16.7 / 21.7 | 26.6 / n/a | 35.3 |

Thinking risk: Opus's thinking cannot be turned off. At effort `high`, output tokens may rise 20–30%. Output is about 60% of body cost, so that adds about 15% to S2/S3: S2 user p95 → ≈ ₹18, S3 user p95 → ≈ ₹25.

**Ink value of a 2-Ink draft (net of GST and Razorpay):** Pro yearly ₹18.4 · Solo yearly ₹22.0 · Pro monthly ₹22.1 · Solo monthly ₹26.4 · top-ups ₹29.5 (₹499 pack) to ₹35.9 (₹65 pack).

**Margin at the mean (user rows), line 60%:**
| | Pro yearly ₹18.4 | Solo monthly ₹26.4 |
|---|---|---|
| S1 | 80% ✅ | 86% ✅ |
| S2 | 60% ⚠️ on the line | 72% ✅ |
| S3 | 45% ❌ | 61% ⚠️ |

**Where the ₹18 cap (900 paise × 2 Ink) binds:**
- **S1:** never. The max seen is ₹12.6.
- **S2:** at about p99 on the golden set (₹19), and at user p95 once Opus thinking is counted (≈ ₹18). Roughly 1–5% of 2-Ink drafts would be **refused**.
- **S3:** at p95 (₹21.7 user rows). About 5–10% of argued-pack drafts refused. That is not acceptable.
- 4-Ink (₹36) and 5-Ink (₹45) drafts clear the cap in every scenario.
- Do not raise the cap to make Opus fit. The cap is the rule that a draft never costs more than it earns; at ₹18.4 on Pro yearly it already sits at break-even.

**Finance ruling:**
1. **No global switch to Opus.** S2 puts the typical draft exactly on the 60% line for our cheapest Ink, and the cap would refuse a few percent of runs. I agree with Arjun's §5.
2. **Opus only per pack (argued packs), only after the blind A/B**, and only if that pack's measured p95 stays under the cap. If an argued pack needs Opus and its p95 does not fit 2 Ink, the pack moves up to **3 Ink** (cap ₹27, Pro yearly value ₹27.6). That is a price change, so it is the founder's call, with Meera's and Ajay's copy re-signed.
3. **A/B spend approved, hard cap ₹600.** Expected cost is about ₹200: 10 Opus drafts at ₹7–15 plus 10 Sonnet at ₹3–8, plus checker passes. Record tokens per draft so the p95 above can be replaced with measured values.
4. **v3 comes first.** v3 adds ₹3–5 per draft (extractor plus extra pass) on any model. S2 + v3 is ≈ ₹10–12 mean on a 2-Ink draft, which is under 60% on Pro yearly. Opus decisions are made on the v3 pipeline, not today's.

Vikram, CFO
