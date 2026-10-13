# T-283 — Remove the describe_first and fact_ledger switches after v1

| Field          | Value |
| -------------- | ----- |
| Phase          | After v1 |
| Owner          | Arjun scopes. Lead (build) |
| Mode           | Cleanup |
| Status         | AC3 (env default) merged to `develop_staging` (797cefd, 12 Oct 2026). Removal of the switches (AC1/AC2) waits until v1 is stable |

`feature.describe_first` and `feature.fact_ledger` keep the new describe-first flow and the fact ledger off for real users until the open blockers (T-187, T-188, T-190, T-194) are done. They also work as a kill switch. Once v1 is stable and every user is on the new flow, both switches and the old path are dead weight (two code paths to test, one database edit before any tester can start).

## Acceptance criteria

1. Arjun decides when: after v1 is stable for N days, or when every blocker is done.
2. The two switches and the old (template-first) path are removed, with tests.
3. Before that, for test environments: both default ON on develop through an environment default, so a tester needs no database edit (Arjun to scope).

## Arjun (12 Oct 2026)

Checked in code: both switches go through one function, `isSwitchOn` in `apps/drafting/src/services/intake.service.ts` (l.~117). `getAppSetting` throws `AppSettingMissingError` for a key that is not in the database, and the catch turns that into "off". Users of the switches: `intake.service.ts`, `intake.routes.ts`, `documents.routes.ts` (≈ l.640 and ≈ l.688), `fact-ledger.service.ts` (the setting name), `ai.service.ts` and `drafter.prompts.ts` (comments and the ledger branch), `scripts/intake-gate.ts`, and the New document page in `apps/web/src/app/dashboard/new/page.tsx`.

**AC3: environment default (build now; small, one lead, drafting only)**
- Add two optional env keys in `apps/drafting/src/config/env.ts`: `FEATURE_DEFAULT_DESCRIBE_FIRST` and `FEATURE_DEFAULT_FACT_LEDGER`, each `on | off`, default `off`.
- In `isSwitchOn`, use the env default **only** when the AppSetting is missing (`AppSettingMissingError`). A value in the database always wins, so `off` stays a working kill switch and a user-id list still works. Any other read error stays "off" (fail closed). The fixture-user rule stays first.
- Develop sets both to `on` in its `.env.production`; production at T-403 decides then. Local and CI keep the default `off`, so existing tests do not change.
- Tests: missing setting + env `on` → on; missing + env `off` → off; setting `off` + env `on` → off; setting a user list + env `on` → only listed users; DB error + env `on` → off.
- Files: `apps/drafting/src/services/intake.service.ts`, `apps/drafting/src/config/env.ts`, its tests. Not legal content, no Ajay. `config/env.ts` is hot: the lead checks `leads.md`.
- **Superseded 13 Oct by T-356:** describe-first is on by default in code; no manual step is needed for it. The original note follows. **Founder (physical, 2 minutes):** add `FEATURE_DEFAULT_DESCRIBE_FIRST=on` and `FEATURE_DEFAULT_FACT_LEDGER=on` to the develop server's `.env.production`, then restart drafting. Without it nothing changes. Alternative with no code: set the two AppSettings to `on` once in the admin screen. That already works today; the env default only removes the need to repeat it on a fresh database.

**AC1: when to remove (decided)**
Remove after all three hold: (1) v1 is released (T-403) with both switches `on` for every user; (2) 14 days pass with no use of the kill switch and no open bug against the new flow; (3) the blockers T-187, T-188, T-190 and T-194 are closed. Priya checks the three and writes the date here. Not before.

**AC2: what removal covers (for the later build)**
- Delete the two settings, `isDescribeFirstEnabled`, `isFactLedgerEnabled`, `isSwitchOn`, the AppSetting seed rows, the env defaults above, and every branch that serves the old template-first flow (the gallery path on the New document page, the closed-route guards in `intake.routes.ts` and `documents.routes.ts`, the ledger-off branch in `ai.service.ts` and `drafter.prompts.ts`).
- Keep: the per-user intake limits (`INTAKE_LIMITS`) and the daily spend cap as the cost brake that the switches also served. The old flow's kill switch is replaced by a revert of the release, not a setting.
- The lead runs `Explore` first and lists every caller; the golden set and `scripts/intake-gate.ts` must still run on the one remaining path. Legal-content files (`ai.service.ts`, `drafter.prompts.ts`) need Ajay's sign-off for the diff, even if only code paths go. Web: the New document page is a UI change; no new design is needed because nothing visible changes, but Anushka verifies the New document flow on develop.
- This is a cleanup ticket in the "After v1" phase and does not need an ADR.
