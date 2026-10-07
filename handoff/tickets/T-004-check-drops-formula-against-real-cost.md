# T-004 — Check the drops formula against real cost

| Field      | Value                                                                                                                        |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Phase      | 0 — Prep                                                                                                                     |
| Owner      | Vikram (analysis), Vishal (query)                                                                                            |
| Mode       | Analysis, no code change                                                                                                     |
| Status     | Ready after T-117 and T-118 step 1. Runs against the production database and Redis (founder, 4 Oct 2026). Query script ready |
| Depends on | T-003                                                                                                                        |
| Branch     | None                                                                                                                         |
| Created    | 2026-10-03                                                                                                                   |

## Goal

Confirm or adjust "50 drops + 2 per paragraph" using recorded token data.

## Context

- Founder confirmed the formula on 3 Oct 2026. The margins behind it were estimates: Sonnet 4 at 3 dollars input and 15 dollars output per million tokens, 96.5 rupees per dollar, about 150 tokens per paragraph, one model call per draft.
- The code makes one call per AI section and resends the system prompt each time, so the real fixed cost per draft may be higher than the estimate of about 3.3 rupees.
- Estimated API cost: 10 paragraphs about 5.5 rupees, 25 about 8.7, 50 about 14.2. At 16 rupees per Ink that is roughly 51, 46 and 41 percent margin.
- Admin code converts at 85 rupees per dollar. The estimate used 96.5. This check uses one rate, taken from settings.
- Image tokens from T-301 are included once that ticket ships.

## How to run this (added 4 Oct 2026)

T-003 is merged to `develop` and verified with one real draft in dev. It is not in production yet.

**Step 1. Fix the inputs (Vikram, founder).**

- **Answered by the founder on 4 Oct 2026: Sonnet for drafting, Haiku for Reception and intake.** Dev was verified on `claude-haiku-4-5-20251001`, so set `ai.drafting_model` in dev to the Sonnet dated id before the batch.
- The model must be set as a full dated id, not a bare alias. With an alias, Helicone returns no usable usage (T-003 spike).
- Replace the two placeholder settings in dev with real values: `ai.rates.<model-slug>` and `finance.usd_inr` (currently `87`).

**Step 2. Collect at least 30 drafts across at least 5 document types (Vishal).**

- Fastest route: a controlled batch on the dev stack, which makes real Helicone calls with real tokens. No production deploy is needed.
- `scripts/test-templates/run-all.sh` already drafts 6 document types with realistic Patna payloads. Three rounds give 18 drafts.
- Add 12 or more drafts of longer document types through the web app (for example a writ, a divorce petition, a criminal appeal, a lease deed), so the sample includes drafts near 50 paragraphs. Repeating the same six short payloads would say little about long drafts.
- Note the start time of the batch. The queries filter on it.

**Step 3. Run the two read-only queries (Vishal).** Neither returns user ids or any draft content.

```js
// Per document type. Set `since` to the batch start time.
const since = ISODate('2026-10-04T00:00:00Z');
db.generations.aggregate([
  {
    $match: {
      createdAt: { $gte: since },
      status: 'completed',
      usageSource: 'provider',
      costStatus: 'priced',
    },
  },
  {
    $group: {
      _id: '$templateId',
      drafts: { $sum: 1 },
      avgParagraphs: { $avg: '$paragraphCount' },
      avgInputTokens: { $avg: '$inputTokens' },
      avgOutputTokens: { $avg: '$outputTokens' },
      avgCalls: { $avg: '$llmCalls' },
      avgCostUsd: { $avg: '$costUsd' },
      maxCostUsd: { $max: '$costUsd' },
    },
  },
  { $sort: { avgCostUsd: -1 } },
]);

// One line per attempt, for fitting cost against paragraphs and for counting failed attempts.
db.generations
  .find(
    { createdAt: { $gte: since } },
    {
      _id: 0,
      templateId: 1,
      status: 1,
      runId: 1,
      runSequence: 1,
      paragraphCount: 1,
      inputTokens: 1,
      outputTokens: 1,
      llmCalls: 1,
      costUsd: 1,
      usageSource: 1,
      costStatus: 1,
      aiModel: 1,
      durationMs: 1,
    },
  )
  .toArray();
```

Save the second result as `handoff/data/t004-generations.json`.

**Step 4. Analysis (Vikram).**

- The table per document type, in rupees at the `finance.usd_inr` rate.
- A straight-line fit of cost against paragraphs: the fixed cost per draft and the cost per paragraph.
- Real cost against the formula price at 0.16 rupees per drop for 10, 25 and 50 paragraphs.
- Two add-ons the rows do not include: the cost of failed attempts (rows sharing a `runId`) and the preflight call, which is not recorded.
- A recommendation: keep 50 + 2, or change the base or the per-paragraph rate.

**Step 5. Sign-off.** The founder signs, Kavya logs it in the Decisions Log, and T-202 is unblocked.

**Step 6. Re-check on production.** After T-003 is deployed and 30 real user drafts exist, run the same queries once more and compare.

## First real data point (3 Oct 2026, dev)

One `affidavit_identity` draft: 1,599 input tokens, 907 output tokens, 10 paragraphs, 1 model call. That is about 91 output tokens per paragraph, against the 150 assumed, and far fewer input tokens than the 6,000 assumed. It is a single short draft, so it proves nothing yet.

- T-206 is delivered. Check the formula at the lengths drafts will really have (5 to 18 paragraphs for most templates, up to 35 for the longest), not only at 10, 25 and 50.

## Acceptance criteria

- Data covers at least 30 real generations across at least 5 document types.
- A table per document type shows average paragraphs, input tokens, output tokens, model calls and rupee cost.
- The table compares real cost with the formula price at 0.16 rupees per drop (Solo rate) for 10, 25 and 50 paragraphs.
- The note recommends keeping the formula or changing the base or the per-paragraph rate.
- The founder signs off and the result is logged in the Notion Decisions Log.
- T-202 does not go live until this is signed.

## In scope

- A read-only query on the `generations` collection (the two queries below)
- A short written result saved in this file

## Out of scope

- Any code change
- Changing plan prices or top-up packs

## References

- Design: Not needed
- ADR: Not needed
- Legal sign-off: Not needed

## Review, 3 Oct 2026

| Reviewer | Verdict    | Note                                                                                                                                     |
| -------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Vikram   | Approved   | Still waits for T-003 and real drafts. I will not sign the formula on estimates.                                                         |
| Priya    | Plan added | T-003 is done. The run plan, queries and first data point are above. The ticket wrongly said `usage_logs`; the data is in `generations`. |

## Batch status (Vishal, 4 Oct 2026): not run, blocked. 0 drafts collected

Nothing was generated, so there are no query results for Vikram yet. Three things block it:

1. **Which Sonnet.** README open question 3 is still open. Every current Sonnet id is a bare id (`claude-sonnet-5-5`, `claude-sonnet-5`, `claude-sonnet-4-6`, per Anthropic's model list of 25 Sep 2026). The only dated Sonnet id is the older `claude-sonnet-4-5-20250929`. The T-003 spike found that Helicone returns usable usage only for a dated id. So either the founder picks 4.5 (dated, known to work), or a newer Sonnet goes through a 30-minute Helicone spike first, as in T-003 step 0. Rates also differ: Sonnet 5.5 and 5 cost 2 dollars input and 10 output per million tokens, Sonnet 4.6 and 4.5 cost 3 and 15. The ticket's estimate assumed 3 and 15.
2. **`finance.usd_inr`.** The real value is Vikram's or the founder's input (step 1). Rows store dollars, so this does not block collection, only the rupee table.
3. **The dev stack named here is not on this laptop.** Local MongoDB has no `lawie` database: no `appsettings`, no `generations`, and not the T-003 verification draft. Redis is not running, and Docker is not installed. Either point me at the dev database T-003 used, or approve a fresh local stack (start Redis, seed settings and a test user, run drafting on :4002).

**Ready to run once unblocked.** `handoff/data/t004-queries.js` runs both step 3 queries unchanged and writes `handoff/data/t004-by-template.json` and `handoff/data/t004-generations.json`:

```
SINCE=<batch start ISO time> mongosh --quiet "$MONGO_URI" handoff/data/t004-queries.js
```

It was checked on a scratch database: failed attempts are left out of query 1 and kept in query 2, and no user ids appear in the output. It warns when the data is below 30 priced drafts across 5 document types.

**Also found:** `scripts/test-templates/run-all.sh` (tracked in git) hardcodes a default `INTERNAL_SECRET`. That value matches `.env.production`. Rotate it in production and remove the default from the script. Not fixed here.

## Update, 4 Oct 2026, 14:1x: unblocked

The three blockers in the batch status above are settled.

1. **Database and Redis.** Founder: run it against the production database and production Redis. There is no budget for a second set, and there are no customers. No dev database is created.
   - Run the drafting service on the laptop with the production env. Use one test user for the whole batch (the script's `smoke@lawie.in`), so the rows can be told apart from real users in the step 6 re-check.
   - The test rows stay in production `generations`. The admin cost screens will count them.
2. **Model.** Helicone is being removed (T-118), so the "full dated id" rule no longer applies. Arjun proposes `claude-sonnet-5-5` for `ai.drafting_model`, the current Sonnet. The founder can name another. Rates for `ai.rates.claude-sonnet-5-5` come from Anthropic's pricing page on the day of the batch, not from this ticket.
3. **Rupee rate.** Vikram sets `finance.usd_inr` to 96.5. The market rate was 96.14 on 2 Oct 2026, and 96.5 is what the original estimate used.

Order: T-117 first (the batch script needs the new secret), then T-118 step 1 (so the batch measures the direct path), then this batch.
