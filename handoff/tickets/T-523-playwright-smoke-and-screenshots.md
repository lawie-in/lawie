# T-523: Playwright smoke, screenshots and impeccable detect in CI

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Arjun (ruling in `.claude/docs/ui-quality.md`, section Playwright), a lead (build) |
| Mode   | Full chain (web, CI) |
| Status | To do. Founder order 21 Oct 2026. Root config and CI files: one lead at a time. Priya |
| Source | `.claude/docs/ui-quality.md` |

## Scope
`@playwright/test` in `apps/web` only, Chromium only. `apps/web/e2e/` smoke flows against `next dev` with the gateway mocked at the network edge (`page.route`); no live services. A separate CI job `web-e2e`. Pinned `impeccable detect` as a report.

## Acceptance criteria
1. Flows: landing, sign-up, login; dashboard shell; new draft; draft ready; Settings plan section. Gateway mocked with `page.route`; no real Anthropic calls.
2. Screenshots at 390, 768 and 1280 px, both themes, saved as CI artefacts. `toHaveScreenshot` goldens only for the shell and landing; never for anything with model text.
3. `web-e2e` runs on push to `develop_staging`; CI installs with `--with-deps chromium`; cloud sessions use `/opt/pw-browsers`, never `playwright install`.
4. `npx impeccable@<pinned> detect apps/web/src --json` runs as a non-blocking report for two weeks, then blocking.
5. Root config and CI files are held by this lead alone while the ticket is open.
