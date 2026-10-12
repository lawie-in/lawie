# Test and CI gaps

- `apps/web` has a Jest setup (`jest.config.js`, `jest.setup.ts`, `yarn workspace @lawie/web test`) but only one suite, for the analytics consent flow (`AnalyticsConsent` and `components/analytics/`). Everything else in `web` is untested, and the test command still uses `--passWithNoTests`. A green `web` run says nothing about pages outside the consent flow.
- `packages/shared` has no tests of its own, despite every service depending on it and CI building it first.
- `.github/workflows/ci.yml` only has jobs for `gateway`, `auth`, `drafting`, `billing`. `web` (tests exist but are not run in CI), `email-worker`, and `packages/email-client` are never run in CI — a change there has no automated safety net at all, so the `tester` and `reviewer` should both weight manual verification higher for tickets touching those three.
- Both deploy workflows (`deploy-production.yml`, `deploy-staging.yml`) are no-op placeholders — they only trigger on `workflow_dispatch` and run a single job that echoes a message. Deployment is manual today; don't assume merging to `develop_staging`, `develop` or `main` deploys anything.
