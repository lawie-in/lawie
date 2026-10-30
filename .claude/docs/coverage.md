# Coverage thresholds

Base Jest config sets 70/70/70/70 (lines/branches/etc.), but every service overrides it:

| Service    | Lines | Branches |
| ---------- | ----- | -------- |
| `billing`  | 70    | 65       |
| `gateway`  | 70    | 15       |
| `auth`     | 35    | 5        |
| `drafting` | 35    | 5        |
| `web`      | 60    | 50       |

A green run in `auth` or `drafting` proves very little about coverage — the branch threshold is low enough that large swaths of conditional logic can go untested and the suite still passes. Don't read "tests pass" as "well covered" for those two services. `tester` agents: a green run satisfies the gate for the `reviewer`, but if you know a change added branching logic in `auth`/`drafting` with no corresponding test, say so in the report's "criteria with no test" field even if the suite is green.

`web`'s threshold is global but measured only over `AnalyticsConsent.tsx` and `components/analytics/` (`collectCoverageFrom` in `apps/web/jest.config.js`), so it says nothing about the rest of the app, including `CookieSettingsButton` and `LogoSplash`, which have suites but are outside `collectCoverageFrom`. Widen `collectCoverageFrom` as more web tests are added.

## Test tiers: sanity and full (T-688, Arjun and Ajay, 29 Oct 2026)

**Mechanism.** Every workspace's `jest.config.js` (drafting, web, auth, billing, gateway, email-worker, `packages/email-client`) defines two Jest `projects`, named exactly `sanity` and `full` (`displayName.name`), picked with `--selectProjects`. `sanity` is an explicit file list in the config; `full` is every test, unchanged. No file was moved, renamed, tagged or deleted. `coverageThreshold` stays at the top level of each config and is only enforced in the full tier: `test:sanity` passes `--coverage=false`, and the thresholds in the table above apply to `test` alone.

| Tier   | Script                                                                                 | Where it runs                                                                                                                 |
| ------ | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| sanity | `yarn workspace @lawie/<name> test:sanity`                                             | `ci.yml`, every push (blocking); a lead before merging, plus their own ticket's tests                                         |
| full   | `yarn workspace @lawie/<name> test` (also `test:watch`, drafting `test:golden:update`) | `full-tests.yml`: nightly on `develop_staging`, every push to `release/**`, on demand. Never blocks a `develop_staging` merge |

Sanity holds, in drafting, 63 files (Ajay's groups A-G plus `t178` and `t429`, plus Arjun's picks: Ink holds, `templates.routes`, `intake-gate`); in web 15; auth 5; billing 6 (including `t436-invoice-issue`, the GST gate); and the whole suites of gateway, email-worker and email-client. `scripts/golden-set/__tests__` has its own job in both workflows. Ajay's list is `handoff/legal/T-688-sanity-legal-gate-tests-ajay.md`.

**Budgets.** The founder's cap is the whole sanity CI run, wall clock, at 5:00 or less; the jobs run in parallel, so the slowest sets it, and each job has `timeout-minutes: 5`. Arjun's per-workspace budgets (drafting 3:30, web 2:30, auth 1:30, billing 1:00, the small workspaces 0:30) are for the test step's time, not the cap. The measured whole run was 3:31. If sanity runs over 5 minutes, propose cuts to Ajay by name; nothing in his groups A-G is dropped silently.

**Ajay's conditions.**

- The full tier must be green on the exact SHA he approves before any release to `main`, including the full court-rules run.
- A new signed-text or gate test joins sanity by default; moving it out needs his yes.
- `scripts/golden-set` live fixtures are not unit tests and stay where they are.
- Ruling (Ajay, 43728e3d): `t178-family-court-citation` and `t429-discharge-ni-act-gate` are in sanity; `t236-recheck-after-citation-removal` and `t346-citation-check-helper` are nightly (full only).

**Rules for the tiers.**

- A red nightly run gets a ticket, and the test that caught the problem moves into sanity (T-688 AC2).
- When T-646 merges, its billing tests join sanity and billing's minimum file count in the guard test rises.
- A green sanity run proves the gates and smoke paths above and nothing about coverage; only the full tier checks the thresholds.

**Adding a file to sanity.** Add its name to the sanity list in that workspace's `jest.config.js` (drafting: `SANITY_FILES`, exact names, no prefix globs). Then add it to the matching list in `scripts/__tests__/t688-test-tiers.test.ts` (`REQUIRED` for Arjun's picks, `FLOOR` for Ajay's legal floor; raise `MIN_SANITY` if the count grows) and run `yarn test:scripts`. Re-check the 5-minute cap afterwards.
