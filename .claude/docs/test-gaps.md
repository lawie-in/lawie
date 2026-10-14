# Test and CI gaps

- `apps/web` has a Jest setup (`jest.config.js`, `jest.setup.ts`, `yarn workspace @lawie/web test`) with about 820 tests (14 Oct 2026), covering the consent flow, intake (BriefStep, CourtPicker, OneFlow), the form renderer, Ink cost lines and export utilities. Many pages are still untested, so a green `web` run says nothing about pages outside those areas.
- `packages/shared` has no tests of its own, despite every service depending on it and CI building it first.
- `.github/workflows/ci.yml` has jobs for `gateway`, `auth`, `drafting` (with a golden-set dry run), `billing`, `email-worker` (`test-email-worker`) and `web` (`Web build`: typecheck, production build, read-only lint, tests; T-369). A real-model golden-set job exists but is not yet a required check (T-376). `packages/email-client` has no CI job of its own, so the `tester` and `reviewer` should weight manual verification higher for tickets touching it.
- Both deploy workflows (`deploy-production.yml`, `deploy-staging.yml`) are no-op placeholders — they only trigger on `workflow_dispatch` and run a single job that echoes a message. Deployment is manual today; don't assume merging to `develop_staging`, `develop` or `main` deploys anything.

- Email tests on develop (email-worker, any ticket that sends mail): use only the SES mailbox simulator addresses (success@simulator.amazonses.com, bounce@simulator.amazonses.com, complaint@simulator.amazonses.com), never real addresses. SES is out of the sandbox since 14 Oct, so real addresses would really be mailed (Arjun, 14 Oct 2026).
