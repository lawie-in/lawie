# Deploying Lawie to production

Production runs six containers plus Redis on one EC2 box, from images in ECR. GitHub Actions builds the images and deploys them over SSM Run Command. The pipeline is **off by default**. The founder turns it on with two repository variables, and no code changes are needed. Design and costs: Arjun, 21 Oct 2026 (T-533, T-534).

The dev/demo box is not affected. It keeps `git pull` + pm2 (`deploy.sh`).

## Files

| File                                      | What it does                                                                                                           |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/release-to-main.yml`   | Cuts `main` from `develop` as a release snapshot, tags it and starts the pipeline.                                     |
| `.github/workflows/main-guard.yml`        | `main-guard` check: fails if `handoff/`, `.claude/`, `CLAUDE.md` or `.github/copilot-instructions.md` exist on `main`. |
| `.github/workflows/deploy-production.yml` | Build, scan, push to ECR, deploy, rollback. Controlled by the switch.                                                  |
| `docker-compose.prod.yml`                 | What runs on the box. It reads no env file.                                                                            |
| `scripts/deploy-prod.sh`                  | SSM send, on-box deploy, health wait, rollback, ECR retag.                                                             |
| `scripts/check-image-no-handoff.sh`       | Fails the build if an image contains handoff content.                                                                  |

## The switch

There are two repository variables (Settings → Secrets and variables → Actions → Variables). Both are **absent** by default. Only the exact value `true` turns one on.

| `PIPELINE_BUILD_ENABLED` | `PIPELINE_DEPLOY_ENABLED` | Push to `main`                                                                                                  |
| ------------------------ | ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| absent                   | absent                    | No job runs. One skipped run, nothing else.                                                                     |
| `true`                   | absent                    | Guard, build, scan, push `sha-<commit>`, move `main` tag. Images land in ECR and nothing else happens.          |
| absent                   | `true`                    | Only the `explain` job runs. It prints that deploy needs build on. Nothing is built or deployed.                |
| `true`                   | `true`                    | Guard, build, scan, push, move `main`, then **deploy** after the founder approves the `production` environment. |

To run it by hand, use Actions → Deploy — Production → Run workflow. It has two inputs:

- `action`:
  - `build` builds and pushes only.
  - `deploy` builds and then deploys, the same as a push.
  - `rollback` points `main` at an existing image and deploys it.
- `sha`: the full 40-character commit on `main`.
  - For `build` and `deploy` it defaults to the head of `main`.
  - For `rollback` it is required.

Manual runs obey the same two variables. If a manual run is blocked by a switch, the `explain` job says which one.

## Release flow (how code reaches `main`)

Nobody merges into `main`. Code reaches it only through `release-to-main.yml`:

1. Actions → Release to main → Run workflow, with input `version` (for example `1.0.0`). The founder approves the `production` environment.
2. The workflow:
   - takes `develop`'s tree;
   - drops `handoff/`, `.claude/`, `CLAUDE.md` and `.github/copilot-instructions.md`;
   - commits on top of `main` as `release: v<version> from develop@<sha>`. There is no force push, and the first release onto an empty `main` works;
   - tags `v<version>` and pushes both.
3. Pushes made with `GITHUB_TOKEN` do not start push-triggered workflows. So the release workflow dispatches `main-guard.yml` and `deploy-production.yml` (`action=deploy`) itself.

## Build

- The images are `${ECR_REGISTRY}/lawie-prod-<svc>` for gateway, auth, drafting, billing, email-worker and web.
- Each image is built from the main commit and loaded locally. It is then scanned with `scripts/check-image-no-handoff.sh`, and pushed as `sha-<commit>` only if the scan is clean.
- When all six are pushed, the `promote` job points `main` at that sha in all six repos.
- web needs `NEXT_PUBLIC_*` at build time. These come from `vars.PROD_NEXT_PUBLIC_API_URL` and `vars.PROD_NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME`. Changing either one means rebuilding web.

## Deploy, health wait, rollback

The `deploy` job runs `scripts/deploy-prod.sh ssm <sha>`. It needs the guard, the build and the promote job to pass, and it uses the `production` environment.

1. It packs `docker-compose.prod.yml` and the script, then sends them with `aws ssm send-command` (`AWS-RunShellScript`). The target is `vars.PROD_INSTANCE_ID`, or the EC2 `Name` tag in `vars.PROD_INSTANCE_TAG`. There is no SSH and port 22 stays closed.
2. On the box, `deploy-prod.sh remote <sha>` runs in `/opt/lawie/release` (`vars.PROD_DEPLOY_DIR` changes the base). It:
   - logs in to ECR with the instance role;
   - runs `docker compose -f docker-compose.prod.yml pull` and `up -d --remove-orphans` with `TAG=sha-<sha>`;
   - waits up to 300 s for every service (redis + six apps) to be healthy.
3. If the deploy is healthy, the box writes the tag to `/opt/lawie/state/current_tag`, and the old one to `previous_tag`.
4. If it is not healthy, the box redeploys the tag from `current_tag` (the last good deploy), waits again, and the job **fails**:
   - exit 1 means it was rolled back and the old version is healthy;
   - exit 3 means the rollback also failed, or this was the first deploy. The box needs a person.
5. A manual rollback is a run with `action=rollback`, `sha=<an earlier release commit>`. It checks that all six `sha-*` images still exist, retags `main` to them, and runs the same deploy.

ECR keeps the last 5 tags (lifecycle policy), so you can only roll back to one of the last few releases. The previous-tag file lives on the box. Nothing about the deploy state is in the repo.

## Secrets (T-534)

There is no env file on the box or in CI. Each service reads `/lawie/prod/<service>` from SSM Parameter Store at boot, using the instance role. The compose file sets `SECRETS_BACKEND=ssm` and `SECRETS_ENV=prod` for this. Until T-534 ships, the services cannot find their secrets, so **do not turn deploy on before T-534 is released**. The founder enters every secret value himself.

## Console checklist (Kunal writes the steps; the founder does them when he says "buy")

Do not do these until the founder says so.

- [ ] ECR: six repos `lawie-prod-{gateway,auth,drafting,billing,email-worker,web}` in ap-south-1. Tags must be **mutable** (the `main` tag moves). Add a lifecycle policy that keeps the last 5 images.
- [ ] IAM: add the GitHub OIDC identity provider (`token.actions.githubusercontent.com`). Then create one role that only `repo:lawie-in/lawie` can assume, limited to `ref:refs/heads/main` and `environment:production`. Its permissions are:
  - ECR push and pull, plus `BatchGetImage`/`PutImage`, on the six repos, and `ecr:GetAuthorizationToken`;
  - `ssm:SendCommand` with `AWS-RunShellScript` on the prod instance only;
  - `ssm:ListCommands` and `ssm:ListCommandInvocations`.

  Put its ARN in `vars.AWS_ROLE_ARN`. **No AWS access keys go into GitHub.**

- [ ] Prod box: t3.medium with Docker, Compose v2 and the AWS CLI, and the SSM agent online. Its instance role needs:
  - ECR pull and `ecr:GetAuthorizationToken`;
  - `ssm:GetParameter(s)` on `/lawie/prod/*`;
  - `AmazonSSMManagedInstanceCore`.

  Set the IMDSv2 hop limit to 2 so containers can reach the role. Run nginx with TLS on the host, proxying to the 127.0.0.1 ports in the compose file.

- [ ] Parameter Store: `/lawie/prod/<service>` SecureString parameters. The founder enters the values.
- [ ] GitHub environment `production`, with the founder as the required reviewer.
- [ ] GitHub repository variables: `AWS_ROLE_ARN`, `AWS_REGION` (`ap-south-1`), `ECR_REGISTRY` (`<account>.dkr.ecr.ap-south-1.amazonaws.com`), `PROD_INSTANCE_ID` (or `PROD_INSTANCE_TAG`), `PROD_NEXT_PUBLIC_API_URL`, `PROD_NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME`. **Leave `PIPELINE_BUILD_ENABLED` and `PIPELINE_DEPLOY_ENABLED` absent.**
- [ ] Branch protection (or a ruleset) on `main`:
  - require the `main-guard` status check;
  - **allow the release workflow (GitHub Actions) to push to `main`**, or `release-to-main.yml` is rejected;
  - block every other push and merge.
- [ ] Atlas Flex in ap-south-1 with 7-day snapshot retention (Ajay's conditions, T-403).
