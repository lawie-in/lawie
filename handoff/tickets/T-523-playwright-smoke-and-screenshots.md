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

6. The dashboard screenshot matrix (Arjun, from the T-520 pass) is covered: 768 px and the 720 top-bar collapse, the app error page, the root loading folio, zero-Ink messages, past_due and ends-at tiles, forced colours, and 200% text.

7. (22 Oct 2026, founder) After T-563 lands, an optional Playwright project `live-develop` runs only when the developer or an agent passes the develop address and the test-signup secret through the environment: it creates a `TEST` user through the bypass and walks the real flows on the develop box. It never runs in CI by default, never against production, and stays inside the T-550 rule (non-local hosts denied unless explicitly allow-listed by that variable). Anushka's own browser run does not use it.
8. Sequence: the `apps/web` Playwright config, specs and screenshots can start after T-544; the `web-e2e` CI job file waits for Tanvi's T-533 to merge (she holds root CI).
