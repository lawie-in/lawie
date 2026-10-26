# T-585: drafting — warn at boot about unset ai.* settings and show them on /health

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (prod hygiene) |
| Owner  | Arjun (raised), Vishal (build) |
| Mode   | Small fix (drafting only) |
| Status | Merged into develop_staging (e0b7ffdf, CI 1030 green), 26 Oct 2026. Redeploy drafting; no env, no migration. Empty config_warnings is not proof the ai.* settings are set. Priya |
| Source | Arjun's go-live finding: prod went live with ai.drafting_model, ai.preflight_model and ai.intake_model all unset and nothing said so |

## Acceptance criteria
1. At boot, drafting logs one WARN per missing AppSetting among `ai.drafting_model`, `ai.preflight_model`, `ai.intake_model`, naming the key only (never a value).
2. `/health` in apps/drafting/src/app.ts adds `config_warnings: [...]` (empty array when none). Status code and the rest of the body unchanged.
3. The warning list is computed once at boot after the AppSettings load and refreshed when those settings are read again; no new DB call per /health request.
4. Tests for: all three set (empty list), one missing, all missing. Drafting tests and build green.

## Files
apps/drafting/src/services/app-settings.service.ts, apps/drafting/src/index.ts, apps/drafting/src/app.ts (/health only), their tests. Nothing else.

## Known limit (Vishal, reviewer note, 26 Oct 2026)
Empty config_warnings is not proof the ai.* settings are set: a failed boot DB read is silent, and the boot reads have no timeout (same as the existing primeToolSwitches).
