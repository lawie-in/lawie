# Cost report (T-453)

A read-only script that totals the model cost of each draft made in one or more time windows. It reads drafting's MongoDB: `generations` (body), `llmauxcalls` (intake and preflight) and `appsettings` (rates). Use it for a CQO test run on develop.

## Run

From the repo root:

```sh
MONGO_URI='<dev connection string>' yarn ts-node --transpile-only scripts/cost-report/main.ts \
  --window "anushka-1=2026-10-15T10:00:00+05:30/2026-10-15T11:00:00+05:30" \
  --window "anushka-2=2026-10-15T14:00:00+05:30/2026-10-15T15:30:00+05:30"
```

Options:

- `--window "<label>=<ISO start>/<ISO end>"` is repeatable. The label is optional (`w1`, `w2`, ...). Times must carry a zone (`+05:30` or `Z`). The start is inclusive and the end is exclusive.
- `--user <userId>` keeps only rows for that user (a 24-hex ObjectId).
- `--json` prints the report as JSON.
- `--include-fixtures` also counts golden-set rows. They are left out by default.
- `--help` prints usage.

You don't need a `package.json` script. `ts-node` already resolves from the root `node_modules`. `mongoose` resolves there too: it is hoisted from the services. The script adds no new dependency.

Exit codes:

- `0`: the report was printed.
- `1`: a database or unexpected error. The message is printed with the URI redacted and no stack trace.
- `2`: bad arguments, or `MONGO_URI` is not set.

## What it does and does not do

The script only reads:

- It only calls `find()`, with inclusive projections of ids, token counts, cost fields, statuses, model ids and times. It never selects names, emails, phone numbers, addresses, prompts, briefs or draft text.
- It registers no Mongoose models, and `autoIndex` and `autoCreate` are off, so it creates no indexes or collections.
- It reads with `readPreference: secondaryPreferred`. That uses a secondary when there is one and still works on a standalone dev server.
- It never prints `MONGO_URI`. Every error passes through `lib/redact.ts`, which hides the full URI and its user, password and host names.

## How rows are linked

These are the fields in `apps/drafting/src/models`:

| Collection                               | Stage                                               | Ids on the row                                                          |
| ---------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------- |
| `generations`                            | body (one row per attempt, from `recordGeneration`) | `documentId`, `runId`, `intakeId` (if it came from an intake), `userId` |
| `llmauxcalls` with `purpose` `intake_*`  | intake                                              | `intakeId`, `userId`                                                    |
| `llmauxcalls` with `purpose` `preflight` | preflight                                           | `userId` only (no intake id or document id, T-437)                      |

How each stage is linked:

- **Body, revisions and intake are linked exactly.** In each window, rows that share any `documentId`, `runId` or `intakeId` count as one draft. Intake rows for a draft generated in the window are fetched by `intakeId` even if the intake started before the window. The `linkage` field shows the result:
  - `exact`: body rows linked to their intake.
  - `body-only`: no intake.
  - `intake-only`: an intake that produced no Generation row in the window.
- **Preflight is not linked exactly.** A preflight row is attached to a draft only when its user made exactly one draft in the window (`preflight=user+window`). Otherwise it goes under "unattributed preflight" for that user in that window. It still counts in the window total and the grand total.
- **Ink class is not stored** on any row, so the class column is always empty.

## How cost is worked out

- **Recorded cost.** If a row has `costStatus: 'priced'`, its own `costUsd` is used. That figure was priced when the row was written and includes the cache. Older Generation rows have no `costStatus`; if their `costUsd` is positive, it is used too.
- **Rows without a usable cost.** This covers rows with `costStatus: 'rate_missing'` and rows with no usable `costUsd`. They are re-priced from their tokens, using today's `ai.rates.<model-slug>` (USD per MTok for input, output, cache write and cache read). The pricing is the same as `llm-usage.ts`:
  - If no cache write rate is configured, it defaults to 2x the input rate. A missing cache read rate defaults to 0.1x.
  - Writes to the 5-minute cache are priced at 1.25x the input rate.
- **No rate for the model.** The row counts as $0 and is flagged `unpriced`, and the model is named in the notes.
- **INR** is USD x `finance.usd_inr` as read when the script runs. If that setting is missing, 85 is used, the same fallback as the service.
- **Where each stage's cost came from** is shown in brackets: `[recorded]`, `[computed]`, `[mixed]` or `[unpriced]`.

## Output

For each draft, the script prints:

- the window label;
- `documentId`, `intakeId`, `runId` and `userId`;
- `docType`, the number of revisions, the linkage and the first and last row times;
- for each stage (body, intake and preflight): calls, input, output, cache-write and cache-read tokens, models, and cost in USD and INR;
- the draft total.

After the drafts come the unattributed preflight rows, a total for each window, the grand total and the notes. If windows overlap, rows in the overlap count in each window, and the notes warn that the grand total counts them twice.

## Code

All the logic is in pure functions, so it can be tested with fake rows:

- `lib/args.ts`: argv -> options.
- `lib/rows.ts`: projections and raw document -> row.
- `lib/rates.ts`: settings -> rate table; tokens + rate -> USD.
- `lib/aggregate.ts`: rows -> per-draft, per-window and grand totals.
- `lib/render.ts`: report -> text.
- `lib/redact.ts`: URI redaction.

`main.ts` handles only I/O.

To typecheck: `yarn tsc --noEmit -p scripts/cost-report/tsconfig.json`. `scripts/jest.config.js` already matches `scripts/**/__tests__/**/*.test.ts`, so tests in `scripts/cost-report/__tests__/` need no config change.
