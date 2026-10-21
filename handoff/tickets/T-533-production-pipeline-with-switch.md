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

## Files (held by one lead alone)
.github/workflows/deploy-production.yml, docker-compose.prod.yml, docs/DEPLOY.md, Dockerfiles only if a missing one blocks the build.
