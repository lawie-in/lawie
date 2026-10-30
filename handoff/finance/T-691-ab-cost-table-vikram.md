# T-691 blind A/B: cost table (Vikram, CFO, 30 Oct 2026)

Committed after Anushka's and Ajay's scores were in and the key was opened (Arjun, 13:00 UTC). **Decision: Sonnet 5.5 stays as the drafter.** The cost half of the decision rule failed for every argued pack.

**Source:** `vikram/metrics.json` and `vikram/intake-spend.json` on `ab/t-691-run-20261030` @ ccb73b28, plus Shashank's console lines. I worked out which model wrote each draft from its cost divided by its cost at Sonnet rates (exactly 1.0 or 2.0 for every draft), and the matter pairs from the console totals per matter. Rates are verified list prices (Opus 5.5 = 2× Sonnet 5.5 on every token class), effort high on both arms, ₹88/$. **Total spend ₹256.87** (drafts ₹254.2, intake ₹2.7) against a ₹600 cap.

## Per matter: ₹ per draft against today's catalogue price

| Matter | Ink | Cap (₹9/Ink) | Sonnet | Opus | Opus fits cap? |
|---|---|---|---|---|---|
| Regular bail | 2 | ₹18 | 2.4–2.8 | 4.9–5.1 | yes |
| Anticipatory bail | 2 | ₹18 | 2.4–2.8 | 4.9–5.1 | yes |
| Bail, surrendered | 2 | ₹18 | 3.0 | 5.7 | yes |
| Bail, Hinglish custody | 2 | ₹18 | 7.9 | 22.8 | no |
| O.39 temporary injunction | 1 | ₹9 | 7.0 | 18.8 | no |
| Quashing s.528 BNSS | 2 | ₹18 | 7.4 | 18.8 | no |
| Declaration | 2 | ₹18 | 7.9 | 16.0 | yes, just |
| Written statement | 2 | ₹18 | 6.1 | 14.1 | yes |
| Partition (Patna) | 2 | ₹18 | 11.8 | 42.2 | no |
| Partition (Ludhiana) | 2 | ₹18 | 11.4 | 38.3 | no |

**By arm (n = 10 each):**
- Sonnet: mean ₹6.8, max ₹11.8, 0 drafts over the cap.
- Opus: mean ₹18.7, max ₹42.2, 5 of 10 over the cap.
- Opus came out at **2.8× Sonnet**, not 2×: it wrote about 1.6× more output tokens at effort high.
- There is one sample per matter, so there is no per-pack p95. Each value is a single draft.

## Conclusions
1. **Opus fails the cost half on every argued pack at current Ink prices** (Hinglish bail, O.39, quashing) and on both partitions. It fits the cap only on simple bail, where no quality gain was expected. A price of about 5 Ink would be needed for those packs; that is the founder's call and was not raised.
2. **Sonnet under-pricing, found by the A/B and independent of it:**
   - **O.39 at 1 Ink costs ₹7.0** (≈ 24% margin on Pro yearly). Proposed: 2 Ink.
   - **Partition at 2 Ink costs ₹11.4–11.8** (≈ 36%). Proposed: L, 4–5 Ink.
   - Both are deferred to next month under the founder's freeze (Arjun, 30 Oct). Priya logs them; the founder decides, and Meera's and Ajay's copy is re-signed.
3. Declaration, quashing and Hinglish bail cost ₹3.7–4.0 per Ink on Sonnet, on the line. These were the hard A/B cases, so they are watched in the monthly review on prod data before any change.
