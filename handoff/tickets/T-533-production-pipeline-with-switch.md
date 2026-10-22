# T-533: Production pipeline with an on/off switch

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release |
| Owner  | Arjun (design: `handoff/ops/prod-pipeline-and-secrets.md`, "Founder decision"), a lead (build) |
| Mode   | Full chain (root config and CI: one lead at a time) |
| Status | To do. Founder GO 21 Oct 2026: build now, buy later, with a switch. Priya |
| Source | Arjun's note, numbers T-528/T-529 there are renamed T-533/T-534 |

## Acceptance criteria
1. Workflow `deploy-production.yml`, `docker-compose.prod.yml`, an SSM Run Command deploy with health wait and rollback, and `docs/DEPLOY.md` written (it is empty today).
2. Two GitHub repository variables, both absent by default: `PIPELINE_BUILD_ENABLED` (build the six images and push to ECR tagged `sha-<commit>` and `main`) and `PIPELINE_DEPLOY_ENABLED` (after a green build, SSM deploy). Both checks are job-level `if: vars.X == 'true'`.
3. With both variables absent a push to `main` is one skipped run and nothing else. Build on, deploy off: images land in ECR and nothing else happens. Deploy on with build off does nothing and prints why.
4. The deploy job targets a GitHub environment `production` with the founder as required reviewer.
5. `workflow_dispatch` with inputs `action: build|deploy|rollback` and `sha`; it respects the same two variables.
6. No AWS access key stored in GitHub (OIDC only); nothing references `.env*` files.
7. Rollback tried against the demo compose locally; evidence in the ticket.
8. The dev box is untouched.

## Added by founder rule, 21 Oct 2026 (Arjun): no handoff docs in production, not even on main
9. First commit of the ticket: `.dockerignore` gains `handoff/`, `.claude/`, `CLAUDE.md`, `.github/`, `**/*.md`; `apps/web/Dockerfile` switches from `COPY . .` to explicit copies like the other five. A workflow test greps each built image for `handoff/` and fails if found.
10. `release-to-main.yml`: `workflow_dispatch`, `production` environment (founder reviews), input `version`; checks out `develop`, removes `handoff/`, `.claude/`, `CLAUDE.md`, `.github/copilot-instructions.md`, commits "release: v<version> from develop@<sha>" onto `main`, tags, pushes. `main` is a snapshot, never a hand merge.
11. A `main-guard` CI job on every push to `main` fails if any of those paths exist; branch protection on `main` requires it; deploy depends on it.
12. T-403's "develop is merged to main" is amended (addendum in that ticket). Nobody merges into `main`, ever: the workflow cuts it.

## Files (held by one lead alone)
.github/workflows/deploy-production.yml, docker-compose.prod.yml, docs/DEPLOY.md, apps/web/Dockerfile and .dockerignore (item 9), .github/workflows/release-to-main.yml and the main-guard job, Dockerfiles only if a missing one blocks the build.

## Arjun (22 Oct 2026) — five design calls after Explore (Tanvi)

All five defaults stand:
1. `main-guard.yml` on push to `main`, separate from `ci.yml`; `deploy-production.yml` re-checks the same paths as its first job and the deploy depends on it; the check name goes in `docs/DEPLOY.md` for the founder's branch-protection step.
2. `docker-compose.prod.yml`: `${ECR_REGISTRY}/lawie-prod-<svc>:${TAG}`, six services + Redis on-box (no published port, `appendonly yes`), Mongo external, **no `env_file`**; config via `environment:`, secrets via T-534's loader (`SECRETS_BACKEND=ssm`, `SECRETS_ENV=prod` set here). `restart: unless-stopped` and the Dockerfile health checks on every service.
3. `release-to-main.yml` ends by dispatching `deploy-production` with `action=deploy` through the API using `GITHUB_TOKEN` (`permissions: actions: write`); no PAT. Branch protection must allow the workflow to push to `main` — founder's step, in DEPLOY.md.
4. Each release is a new commit on `main` with the tree replaced; never a force push.
5. Fix the stale README line (Parameter Store, not Secrets Manager).
AC7 rollback: if full builds do not fit the runner, two small tagged stand-in images are acceptable, stated in the report.
