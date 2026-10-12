# Golden set (T-147e)

A set of synthetic, Hinglish-heavy matters that runs through the real drafting pipeline, so that the T-147 failures (invented averments, dropped facts, changed facts) cannot come back unnoticed.

Each fixture goes through the service's own routes, in-process. No drafting logic is copied:

1. `POST /intake/brief`: reception, the extraction pass and the fact ledger.
2. `POST /intake/brief/update`: the fixture's answers, if it has any.
3. `POST /generate-from-brief`: the ledger Drafter, then the fact verifier.

The assertions are:

- the verifier's four checks (unsupported, dropped, mutation, banned), read from the run's `FactDiff` rows. By default any finding fails the fixture, including a banned phrase the pipeline stripped before delivery. A fixture can accept a known finding in `expect.allow_violations`.
- each fixture's own expectations: `not_written`, `absent`, `present`, `exact` (character-exact) and `ledger`.

**Fixture status:** every fixture was drafted by dev from Anushka's reports and has not yet been reviewed by Anushka. Each file records this in its `review` field. No fixture asserts prayer, verification or other legal wording, so every `ajay` field is `null`.

## Commands

```sh
yarn workspace @lawie/shared build

# Free. Recorded replies, in-memory MongoDB, no network. Used by CI and the tester.
yarn workspace @lawie/drafting golden:set --dry-run
yarn workspace @lawie/drafting golden:set --dry-run --stub t147   # the T-147 replies: fixture 1a must FAIL

# THE REAL MODEL AND THE REAL DATABASE. Costs money. Run by the founder or by CI.
GOLDEN_SET_ANTHROPIC_API_KEY=... GOLDEN_SET_MONGODB_URI=... \
  yarn workspace @lawie/drafting golden:set --real
```

| Option                 | Meaning                                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `--dry-run` / `--real` | One is required. The runner refuses to call the real model without `--real`.                                                |
| `--only 1a,06`         | Run only these fixture ids (or id prefixes).                                                                                |
| `--stub <variant>`     | Dry run only. Selects the recorded replies to use (default `clean`). Fixtures with no replies for that variant are skipped. |
| `--calibrate`          | Also report per-fact-type confidence distributions and suggested floors (AC7).                                              |
| `--max-fixtures <n>`   | Refuses to start if more fixtures are selected. The default is 20; the hard cap is 40.                                      |
| `--max-tokens <n>`     | Stops starting new fixtures once the run has used this many tokens. The default is 600000. A capped run exits 1.            |
| `--out <dir>`          | Where the results JSON goes. The default is `scripts/golden-set/results/`, which is git-ignored.                            |
| `--verbose`            | Also prints the service's own log lines for each fixture. These are ids and counts only.                                    |

Exit codes: `0` all passed; `1` a fixture failed or the token cap stopped the run; `2` refused (bad flags, missing secrets or over the caps); `3` **fixture isolation breached**; `4` harness error.

## Environment for `--real`

| Variable                       | Required | Use                                                                                                                                                          |
| ------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GOLDEN_SET_ANTHROPIC_API_KEY` | yes      | The runner passes it to the service as `ANTHROPIC_API_KEY`.                                                                                                  |
| `GOLDEN_SET_MONGODB_URI`       | yes      | The database to run against, which is production while there is no dev DB. The runner passes it as `MONGO_URI`.                                              |
| `GOLDEN_SET_ENCRYPTION_KEY`    | no       | 64 hex characters. If unset, fixture drafts are encrypted under a random per-run key. That is fine: they are synthetic, and only the runner reads them back. |

- No `.env` file is read.
- Redis is always an in-memory mock, because it holds only the intake limits and the intake cache.
- The models and rates are the existing `ai.intake_model`, `ai.drafting_model` and `ai.rates.<model>` settings in that database.
- Secrets are never printed.
- A real run sets `NODE_ENV=development` inside the runner process (see `run.ts`). It does not change the environment of the shell that started it.

## Cost

Before a real run, the runner prints an estimate from the token caps the pipeline already uses (reception 3000, extraction 1500, Drafter, repair and fact repair 8192 each), priced at the seeded rates. For the current 19 fixtures, at $1/$5 per MTok for the intake model and $3/$15 per MTok for the drafting model:

- **typical about $1.85 per full run**
- **worst case $9.27** (every repair pass running at its full cap)

If a rate is not seeded, the runner prices it at $15/$75 as a fallback, so the estimate errs high (worst case about $52). Nightly runs would therefore cost about $55 a month typical.

## Fixture isolation (AC4, release-blocking)

A golden-set run acts as the reserved user `0000000000000000000f147e` (`GOLDEN_SET_USER_ID` in `apps/drafting/src/services/run-origin.ts`). Being a fixture run depends only on that user, never on anything a request can send.

- The fixture user has no `users` row, so it has no balance and appears in no user count.
- A schema plugin marks every `Document`, `FactLedger`, `LlmAuxCall` and `Event` row written for it as `runType: "fixture"`. `Generation` rows get `runOrigin: "fixture"`, because `Generation.runType` already means initial or revision (T-110).
- Its `FactDiff` and `PlaceholderRate` rows are `fixture` through the ledger.
- `enforceCredits` and the Ink hold functions (`holdInk`, `extendInkHold`, `settleInk`, `releaseInk`, and the expired-hold sweep) skip the fixture user, so no Ink is checked, held or charged and no `inkledger` or `CreditLedger` row is written. Since T-226 the generate route holds Ink before the run and settles it after, instead of charging with `spendInk` afterwards.
- User-facing lists, admin stats, usage counters, the free limit and the spend cap filter out `fixture` rows.
- The gateway's dev-bypass refuses the reserved id with a 403, so nobody can act as the fixture user through the gateway.

After each fixture the runner reads back every row of the run and checks the marker. If any row is unmarked, if an ink or credit row appears, or if a `users` row appears, the run exits 3.

The rows stay in the database so that each failure can be traced through the `runId` recorded in the results (AC6). Every `runId`, `intakeId`, `documentId` and `ledgerId` is in the results JSON and on the console.

## Confidence floors (AC7): calibration pending

`--calibrate` compares each extraction read with the fixture's `expect.ledger` (the ground truth). For each fact type it reports the confidence of right and wrong reads and suggests a floor: just above the highest wrong read, and never lower than the current floor. With fewer than 5 samples of a type, it keeps the current floor.

**The floors in `packages/shared/src/utils/normalize/confidence.ts` are unchanged.** Calibration is pending the first real run. Record the chosen values here and in that file once the founder has run `--real --calibrate`.

## CI

The `golden-set` job in `.github/workflows/ci.yml` runs:

- on pull requests that change `apps/drafting/src/services/drafter.prompts.ts`, `apps/drafting/src/config/document-rules/**`, `packages/shared/src/utils/normalize/**` or this folder
- nightly at 02:00 IST
- on manual dispatch

Each time, it runs the dry run. It also runs the real set only when both repository secrets, `GOLDEN_SET_ANTHROPIC_API_KEY` and `GOLDEN_SET_MONGODB_URI`, are set. Otherwise it posts a notice and stays green. The two secrets are passed to the real-run step only, not to the whole job. The nightly run has its own concurrency group, so a push to `develop` cannot cancel it.

A pull request from the same repository that changes `scripts/golden-set/**` runs that PR's own code with the production database secret, so review changes to this folder before CI runs them. Pull requests from forks get no secrets, so they run the dry run only.

To make it a blocking pre-merge gate, add "Golden set — Drafting (real model)" as a required check on `develop` in the branch protection settings.

## Adding a fixture

Add one JSON file to `fixtures/`, using `lib/types.ts` (`Fixture`) as the shape. Each fixture:

- needs an id, a pack, a `risk` naming the real failure, a `source` and at least one explicit expectation
- needs the `review` line as it stands in the other files
- needs a reason in `ajay` if it asserts legal wording, which Ajay must then confirm
- must hold synthetic data only

`recorded` is optional and is used by the dry run only.
