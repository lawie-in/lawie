# Test and CI gaps

- `apps/web` has zero tests and passes CI with none — a green status for `web` means nothing about correctness.
- `packages/shared` has no tests of its own, despite every service depending on it and CI building it first.
- `.github/workflows/ci.yml` only has jobs for `gateway`, `auth`, `drafting`, `billing`. `web`, `email-worker`, and `packages/email-client` are never run in CI — a change there has no automated safety net at all, so the `tester` and `reviewer` should both weight manual verification higher for tickets touching those three.
- Both deploy workflows (`deploy-production.yml`, `deploy-staging.yml`) are no-op placeholders — they only trigger on `workflow_dispatch` and run a single job that echoes a message. Deployment is manual today; don't assume merging to `develop` or `main` deploys anything.
