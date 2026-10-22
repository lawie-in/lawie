# Deploying Lawie to production

Production runs six containers plus Redis on one EC2 box, from images in ECR. GitHub Actions builds the images and deploys them over SSM Run Command. The pipeline is **off by default**. The founder turns it on with two repository variables, and no code changes are needed. Design and costs: Arjun, 21 and 22 Oct 2026 (T-533, T-534).

The dev/demo box is not affected. It keeps `git pull` + pm2 (`deploy.sh` at the repo root).

## Prerequisites (founder, before T-533 is merged)

1. **The default branch must be `develop`** (Settings → General → Default branch). Both workflows run from the default branch: `workflow_dispatch` runs the workflow file from the branch it is dispatched on, and `main` carries no workflows at all. If the default branch is `main`, switch it (one click, no history change). `release-to-main.yml` refuses to run when it is not `develop`.
2. **Branch protection (or a ruleset) on `main`**: only the GitHub Actions bot may push (the release workflow), no force pushes, no deletions, nobody merges into `main` by hand.
3. **GitHub environment `production`** with the founder as the required reviewer. The reviewer gate is the control: add **no** deployment-branch restriction (or, at most, "protected branches only"). Do not restrict it to `main`: the jobs that use it run from `develop`.

`main` today still carries `.claude/`, `CLAUDE.md` and `.github/` from the last hand merge. The first release removes them. Until then the path guard would fail on `main`. The first release is dispatched from `develop`.

## Files

| File                                      | What it does                                                                                                         |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/release-to-main.yml`   | Cuts `main` from `develop` as a release snapshot, runs the `main-guard` job on it, pushes, then starts the pipeline. |
| `.github/workflows/deploy-production.yml` | Path guard, build, scan, push to ECR, deploy, rollback, and the rollback drill. Controlled by the switch.            |
| `docker-compose.prod.yml`                 | What runs on the box. It reads no env file. A copy lives on the box (see "Console checklist").                       |
| `scripts/deploy-prod.sh`                  | SSM send, on-box deploy, health wait, rollback, ECR retag. A copy lives on the box as `/opt/lawie/deploy.sh`.        |
| `scripts/check-image-no-handoff.sh`       | Fails the build if an image contains handoff content.                                                                |

The workflows live on `develop` only. `docker-compose.prod.yml`, `scripts/`, `.dockerignore` and the Dockerfiles are part of every `main` snapshot; the deploy workflow checks that they are there.

## The switch

There are two repository variables (Settings → Secrets and variables → Actions → Variables). Both are **absent** by default. Only the exact value `true` turns one on.

Nothing is triggered by a push to `main`. Every run is a `workflow_dispatch` of Actions → Deploy — Production, either by `release-to-main.yml` (with `action=deploy` and the new `main` sha) or by hand. It has two inputs:

- `action`:
  - `build` builds and pushes only, then moves the ECR `main` tag.
  - `deploy` builds, moves the `main` tag, then deploys. This is what a release dispatches.
  - `rollback` points the `main` tag at an existing image and deploys it.
  - `rollback-drill` runs the AC7 drill on the runner. It ignores both variables (see "Rollback drill").
- `sha`: the full 40-character commit on `main`.
  - For `build` and `deploy` it defaults to the head of `main`.
  - For `rollback` it is required.
  - For `rollback-drill` it is ignored.

Which jobs run:

| `action`         | `PIPELINE_BUILD_ENABLED` | `PIPELINE_DEPLOY_ENABLED` | Jobs that run                    | Result                                                                                |
| ---------------- | ------------------------ | ------------------------- | -------------------------------- | ------------------------------------------------------------------------------------- |
| `build`          | absent                   | any                       | `explain`                        | Nothing is built or deployed. `explain` says which switch is off.                     |
| `build`          | `true`                   | any                       | guard, build, promote            | Images land in ECR as `sha-<commit>`, ECR `main` moves. Nothing is deployed.          |
| `deploy`         | absent                   | absent                    | `explain`                        | The pipeline is off: nothing is built or deployed.                                    |
| `deploy`         | absent                   | `true`                    | `explain`                        | Deploy needs build on, so nothing is built or deployed.                               |
| `deploy`         | `true`                   | absent                    | guard, build, promote, `explain` | `explain`: "built and retagged main; not deployed".                                   |
| `deploy`         | `true`                   | `true`                    | guard, build, promote, deploy    | Deploy waits for the founder's approval of the `production` environment.              |
| `rollback`       | absent                   | any                       | `explain`                        | Nothing is retagged or deployed.                                                      |
| `rollback`       | `true`                   | absent                    | guard, `explain`                 | Nothing is retagged or deployed. `explain` says deploy is off.                        |
| `rollback`       | `true`                   | `true`                    | guard, rollback                  | Retag `main` to `sha`, deploy it, after the founder's approval.                       |
| `rollback-drill` | any                      | any                       | `rollback-drill`                 | Drill on the runner's Docker with stand-in images. No AWS, no variables, no approval. |

"guard" is the `main-guard-check` job. It checks out the given sha (it must be on `main`) and fails if `handoff/`, `.claude/`, `CLAUDE.md` or `.github/` exist in it, or if a file the pipeline needs is missing. Build, promote, deploy and rollback all depend on it.

## Release flow (how code reaches `main`)

Nobody merges into `main`. Code reaches it only through `release-to-main.yml`, run from `develop`:

1. Actions → Release to main → Run workflow, on branch `develop`, with input `version` (for example `1.0.0`).
2. Job `cut` takes `develop`'s tree and drops `handoff/`, `.claude/`, `CLAUDE.md` and the whole `.github/` directory. It commits the result on top of `main` as `release: v<version> from develop@<sha>` and tags `v<version>`. It pushes nothing. The first release onto an empty `main` works too.
3. Job `main-guard` checks that exact commit: it fails if any of those four paths exist in it, or if `docker-compose.prod.yml`, `scripts/deploy-prod.sh`, `scripts/check-image-no-handoff.sh`, `.dockerignore` or a Dockerfile is missing.
4. Job `release` waits for the founder's approval of the `production` environment. It then pushes `main` and the tag in one atomic push with `GITHUB_TOKEN`. The push is a fast-forward and is never forced. Because `main` carries no `.github/`, a release never changes a workflow file on `main`, so `GITHUB_TOKEN` is allowed to push it.
5. It dispatches `deploy-production.yml` on the default branch with `action=deploy` and `sha=<new main>`. The run obeys the two switches (see the table).

## Build

- The images are `${ECR_REGISTRY}/lawie-prod-<svc>` for gateway, auth, drafting, billing, email-worker and web.
- Each image is built from the `main` commit and loaded locally. It is then scanned with `scripts/check-image-no-handoff.sh`, and pushed as `sha-<commit>` only if the scan is clean.
- When all six are pushed, the `promote` job points the ECR `main` tag at that sha in all six repos.
- web needs `NEXT_PUBLIC_*` at build time. These come from `vars.PROD_NEXT_PUBLIC_API_URL` and `vars.PROD_NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME`. Changing either one means rebuilding web.

## Deploy, health wait, rollback

The `deploy` job runs `scripts/deploy-prod.sh ssm <sha>`. It needs the guard, the build and the promote job to pass, and it uses the `production` environment.

1. It sends **one short line** with `aws ssm send-command` (`AWS-RunShellScript`, `executionTimeout` 1800 s). The line runs `/opt/lawie/deploy.sh remote sha-<sha>` with the registry, region, compose file and state directory set. The target is `vars.PROD_INSTANCE_ID`, or the EC2 `Name` tag in `vars.PROD_INSTANCE_TAG`. There is no SSH and port 22 stays closed. Nothing else is shipped: `deploy.sh` and `docker-compose.prod.yml` are already on the box (console steps). `vars.PROD_DEPLOY_DIR` changes `/opt/lawie`.
2. On the box, `deploy.sh remote` runs in `/opt/lawie`. It:
   - logs in to ECR with the instance role;
   - runs `docker compose -f /opt/lawie/docker-compose.prod.yml pull` and `up -d --remove-orphans` with `TAG=sha-<sha>`;
   - waits up to 300 s for every service (redis + six apps) to be healthy.
3. If the deploy is healthy, the box writes the tag to `/opt/lawie/state/current_tag`, and the old one to `previous_tag`.
4. If it is not healthy, the box redeploys the tag from `current_tag` (the last good deploy), waits again, and the job **fails**:
   - exit 1 means it was rolled back and the old version is healthy;
   - exit 3 means the rollback also failed, or this was the first deploy. The box needs a person;
   - exit 2 is a usage or configuration error; exit 4 means the SSM command itself failed, timed out, matched no instance, or `/opt/lawie/deploy.sh` is missing.
5. A manual rollback is a run with `action=rollback`, `sha=<an earlier release commit>`. It checks that all six `sha-*` images still exist, retags `main` to them, and runs the same deploy.

After an **automatic** rollback, the ECR `main` tag may still point at the failed sha, because `promote` runs before `deploy`. This is harmless: the box always deploys an explicit `sha-*` tag and never pulls `main`. The next good release (or a manual `rollback`) moves `main` again.

ECR keeps the last 5 tags (lifecycle policy), so you can only roll back to one of the last few releases. The previous-tag file lives on the box. Nothing about the deploy state is in the repo.

### When `docker-compose.prod.yml` or `deploy-prod.sh` changes

The box does not read either file from git. When a release changes one of them, copy the new version from that release's `main` commit to the box **before** dispatching the deploy (same console step as the first time):

- `docker-compose.prod.yml` → `/opt/lawie/docker-compose.prod.yml`
- `scripts/deploy-prod.sh` → `/opt/lawie/deploy.sh` (executable, owned by root)

A deploy with a stale copy runs the old compose file against the new images.

## Rollback drill (AC7)

Run Actions → Deploy — Production → Run workflow with `action=rollback-drill`, on any branch (for T-533: on the feature branch). It needs no repository variables, no AWS and no environment approval, and runs on a GitHub-hosted runner's Docker:

1. Starts a throwaway local registry on `localhost:5000`.
2. Builds two **stand-in images** (busybox httpd serving every app port; not the real Lawie images). Tag A answers `/health` and `/` with 200. Tag B answers 404, so its health check fails. Both are pushed for all six services as `localhost:5000/lawie-prod-<svc>:sha-<a…|b…>`.
3. Runs the real `scripts/deploy-prod.sh remote` against the real `docker-compose.prod.yml` (`SKIP_ECR_LOGIN=1`, `ECR_REGISTRY=localhost:5000`): deploy A (expect exit 0), then deploy B (expect B to go unhealthy, the script to roll back to A, exit 1).
4. Asserts that every app container runs tag A and is healthy, Redis is healthy and `current_tag` is A. The job summary shows a PASS/FAIL table. The job fails on any FAIL.

## Secrets (T-534)

There is no env file on the box or in CI. Each service reads `/lawie/prod/<service>` from SSM Parameter Store at boot, using the instance role. The compose file sets `SECRETS_BACKEND=ssm` and `SECRETS_ENV=prod` for this. Until T-534 ships, the services cannot find their secrets, so **do not turn deploy on before T-534 is released**. The founder enters every secret value himself.

## Console checklist (Kunal writes the steps; the founder does them when he says "buy")

Do not do these until the founder says so, except the three prerequisites at the top, which come before T-533 merges.

- [ ] Default branch `develop`; branch protection on `main` (GitHub Actions bot only, no force push); `production` environment with the founder as required reviewer and no branch restriction. See "Prerequisites".
- [ ] ECR: six repos `lawie-prod-{gateway,auth,drafting,billing,email-worker,web}` in ap-south-1. Tags must be **mutable** (the `main` tag moves). Add a lifecycle policy that keeps the last 5 images.
- [ ] IAM: add the GitHub OIDC identity provider (`token.actions.githubusercontent.com`). Then create one role that only `repo:lawie-in/lawie` can assume. The workflows run from `develop`, so the trust policy allows these subjects:
  - `repo:lawie-in/lawie:ref:refs/heads/develop` (build and promote jobs);
  - `repo:lawie-in/lawie:environment:production` (deploy and rollback jobs).

  Its permissions are:
  - ECR push and pull, plus `BatchGetImage`/`PutImage`, on the six repos, and `ecr:GetAuthorizationToken`;
  - `ssm:SendCommand` with `AWS-RunShellScript` on the prod instance only;
  - `ssm:ListCommands` and `ssm:ListCommandInvocations`.

  Put its ARN in `vars.AWS_ROLE_ARN`. **No AWS access keys go into GitHub.**

- [ ] Prod box: t3.medium with Docker, Compose v2 and the AWS CLI, and the SSM agent online. Its instance role needs:
  - ECR pull and `ecr:GetAuthorizationToken`;
  - `ssm:GetParameter(s)` on `/lawie/prod/*`;
  - `AmazonSSMManagedInstanceCore`.

  Set the IMDSv2 hop limit to 2 so containers can reach the role. Run nginx with TLS on the host, proxying to the 127.0.0.1 ports in the compose file.

- [ ] On the box, from the `main` commit that will be deployed first:
  - copy `scripts/deploy-prod.sh` to `/opt/lawie/deploy.sh` (`chmod 0755`, owned by root);
  - copy `docker-compose.prod.yml` to `/opt/lawie/docker-compose.prod.yml`;
  - create `/opt/lawie/state`.

  Repeat the copy whenever a release changes either file (see "When `docker-compose.prod.yml` or `deploy-prod.sh` changes").

- [ ] Parameter Store: `/lawie/prod/<service>` SecureString parameters. The founder enters the values.
- [ ] GitHub repository variables: `AWS_ROLE_ARN`, `AWS_REGION` (`ap-south-1`), `ECR_REGISTRY` (`<account>.dkr.ecr.ap-south-1.amazonaws.com`), `PROD_INSTANCE_ID` (or `PROD_INSTANCE_TAG`), `PROD_NEXT_PUBLIC_API_URL`, `PROD_NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME`. **Leave `PIPELINE_BUILD_ENABLED` and `PIPELINE_DEPLOY_ENABLED` absent.**
- [ ] Atlas Flex in ap-south-1 with 7-day snapshot retention (Ajay's conditions, T-403).
