# T-691b — test data on the prod cluster: tagging, exclusion, cleanup, and where the nightly runs (Arjun, 30 Oct 2026)

Founder decision (via Priya, 30 Oct): no separate fixtures cluster; test runs tag what they write with a recognisable runId. This file is the design. Priya assigns the build (one lead, full chain; my suggestion: Kunal).

## 1. What already exists (keep, do not duplicate)
- One reserved fixture user, `GOLDEN_SET_USER_ID` (`run-origin.ts`); `isFixtureUser()`.
- `fixtureOriginPlugin` stamps `runOrigin: 'fixture'` (Generation) or `runType: 'fixture'` (other models) on every doc the fixture user writes; `NOT_FIXTURE` / `NOT_FIXTURE_GENERATION` filters; credits, email verification, feature switches and the v3 stage all special-case the fixture user.
- Admin counts and analytics already exclude fixture rows (T-379 readers test).

## 2. Add: a recognisable run id on every fixture write
- The harness sets a **fixture run id** `fx-<YYYYMMDD>-<6 hex>` once per nightly run and carries it through `run-context.ts` (`RunContext.fixtureRun?: string`; no second AsyncLocalStorage). Generation rows get it as their `runId` (so `runId` starts with `fx-` for every fixture generation); every other model the plugin touches gets a new field `fixtureRun: string` set by the same `pre('validate')` hook when `isFixtureUser(userId)`. Nothing is set for real users.
- Invariant, tested: a doc with `fixtureRun` set, or a Generation whose `runId` starts with `fx-`, always has the fixture user id; and the converse. A doc of the fixture user with neither is a test failure (`fixture-tag-invariant`).
- A **model registry** `apps/drafting/src/services/fixture-models.ts` lists every model that can carry a userId (drafting and billing); a boot-health style test asserts every registered model has the plugin and every model file with a `userId` path is registered (so a new collection cannot forget it).

## 3. Exclusion
- Unchanged in rule: every user-facing list, admin count, KPI, PlaceholderRate, token/cost total and Sentry metric filters with `NOT_FIXTURE*`. Add the one missing guard: a test that greps the admin readers and the `count-generations` / `token-stats` doc actions' queries for the filter (numbers Nikhil reports must exclude fixtures too).

## 4. Cleanup
- `scripts/golden-set/cleanup.ts`: deletes every doc of the fixture user across the registry (§2) whose `createdAt` is older than `--keep-days` (default 7), plus the Redis keys the harness wrote (prefix `fx:`). Dry run by default; `--apply` deletes; report numbers only. Runs at the end of every nightly, and on demand as a Nikhil doc action `fixture-cleanup`.
- T-187 TTLs still apply to fixture ledgers; cleanup is the belt to that brace.

## 5. Where the nightly live run executes (the real T-691b problem)
- The reason T-691b was raised was network: a GitHub Actions job cannot reach the prod Atlas cluster without `0.0.0.0/0` on prod, which stays forbidden. Tagging does not change that.
- **Decision: the nightly live golden set runs on the develop box, not on GitHub.** The box's IP is already on the Atlas access list; the Mongo URI comes from the box env file (never a GitHub secret). Nikhil adds a `lawie-prod-ops` action `golden-set-nightly` (pinned version) that runs `scripts/golden-set/run.ts --real` from the deployed tree with the fixture run id, then `cleanup.ts --apply`, and posts the report row; a box cron or EventBridge schedule fires it nightly. CI keeps the cassette tier only (T-659 skip-on-push stays).
- Founder: delete the `GOLDEN_SET_MONGODB_URI` repository secret once the box job is green (no prod URI in GitHub).

## 6. Not changed
- T-691 (A/B) stays on in-memory Mongo. No test ever reads customer rows: the harness queries by fixture user id only (`fixture-reads-own-rows-only` test exists; keep it).
