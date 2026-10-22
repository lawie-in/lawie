# apps/web e2e (T-523)

Playwright smoke flows and a screenshot matrix for `apps/web`. Chromium only.

## Run

```
cd apps/web
yarn playwright test --project=desktop-1280      # flows + matrix
yarn playwright test --project=mobile-390        # matrix only (flows skip)
yarn playwright test --project=tablet-768        # matrix only (flows skip)
yarn playwright test --project=desktop-1280 e2e/billing.spec.ts
```

Use `yarn playwright ...` from `apps/web`, not `yarn workspace ... exec playwright` (yarn v1 swallows flags).
The config starts `next dev -p 3100` itself and never reuses a server: if something holds :3100, stop it first.

## Rules

- Local only (T-550). The browser may reach only `localhost` / `127.0.0.1`. The fixture aborts every other host and
  fails the test; a gateway call (`http://localhost:4000`) with no mock also fails it.
- Never run `playwright install`. Cloud sessions use `/opt/pw-browsers`; CI installs with `--with-deps chromium`.
- Goldens (`toHaveScreenshot`) are generated in CI only (real fonts). They exist for the shell and landing only, and run
  only with `E2E_GOLDENS=1`. Never commit a `__screenshots__` baseline from a sandbox. Never `--update-snapshots` here.
- Never click the analytics consent Accept (it loads gtag, which the guard blocks). Consent is seeded denied and synced.
- Environment: never print it (`env`, `printenv`, `export`, `set`). Check a variable with `[ -n "$VAR" ] && echo set`.
  Any `next build` must run as `NEXT_PUBLIC_API_URL=http://localhost:4000 yarn workspace @lawie/web build`.
- Clean up: nothing left on :3100; delete `test-results/` and `playwright-report/` (gitignored).

## What is mocked

Everything the page calls on the gateway, with `mockApi` (see `fixtures.ts`, builders in `mocks/`): auth login/me,
credits balance, billing status/plans/invoices/subscribe/cancel, dashboard summary, documents, intake enabled,
template configs, the brief, the generate-from-brief SSE stream (synthetic text only), document PATCH, and the section
finder lists. Sign-in uses an unsigned fake JWT. Razorpay is never contacted: the subscribe reply carries a local URL.

## Files

- `landing-auth.spec.ts`, `dashboard-shell.spec.ts`, `new-draft.spec.ts`, `billing.spec.ts`: flows, desktop-1280 only.
- `screenshots.spec.ts`: matrix on all three projects x night/daylight. PNGs go to
  `e2e/artefacts/<project>/<theme>/<name>.png` (gitignored; CI uploads them).
- `harness.spec.ts`: proves the guard and preflight.

## Known gaps

Sign-up spec is `fixme` until T-522 merges. The root loading folio shot is `fixme` (not reachable without a src change).
`/dashboard/documents` overflows sideways below 1280 px (marked `test.fail` in the matrix).
