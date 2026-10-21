# Production pipeline and secrets: cost and timing

Founder, 21 Oct 2026: "whenever I merge to main it should trigger the docker deployment… the live server picks it and restarts with the latest… also time to move to Amazon Secrets Manager. Cost analysis, and now or after phase 2?" Arjun's analysis. Prices are AWS list prices for ap-south-1 (Mumbai), on-demand, October 2026, from memory, at ₹85/$ — Vikram verifies before anything is bought.

## Where we are

- One box: `lawie-demo`, t3.micro, free tier, runs `develop` from a git checkout under pm2, `.env.production` on disk shared by all apps, nginx in front. No production exists.
- Dockerfiles exist for all six apps (multi-stage, node:20-alpine, non-root, health checks; drafting carries Chromium for PDFs). `docker-compose.yml`, `.staging.yml`, `.demo.yml` exist. Both deploy workflows are placeholders; `docs/DEPLOY.md` is empty.
- T-403 already requires: production is a fresh environment, all-new secrets, nothing reused from today's box, rollback written and tried.

## What "the pipeline" is, concretely

No Kubernetes. EKS costs $73/month for the control plane before a single node, and we have six small services on one machine. "Restart the pod" becomes `docker compose up -d`, which recreates only the containers whose image changed. Same effect, no cluster.

1. **Build** (GitHub Actions, on push to `main`): build the six images with layer cache, tag `sha-<commit>` and `main`, push to **ECR** in ap-south-1. Authentication by **OIDC** (GitHub's identity federated to one IAM role scoped to `ecr:*` on our repositories) — no AWS access key stored in GitHub.
2. **Deploy** (same workflow, after build): **SSM Run Command** to the prod instance: `docker compose pull && docker compose up -d --remove-orphans`, then wait for the compose health checks. No SSH key, no port 22 open to GitHub. The instance needs an instance role with `ecr:GetAuthorizationToken` + pull, and `ssm:GetParameter` on `/lawie/prod/*`.
3. **Rollback**: `main` is retagged to the previous `sha-*` by a `workflow_dispatch` input, deploy step reruns. Tried once before the first release (T-403 already demands this).
4. **develop stays as it is** (git pull + pm2) until prod is proven; then the same pipeline runs for `develop` → the develop box with a `develop` tag, and pm2 goes.

## Secrets

Two AWS options, same code either way (one loader in `packages/shared`: at boot, read one JSON document per service by the instance role; in dev and tests, read the environment as today).

| | SSM Parameter Store (standard, SecureString) | Secrets Manager |
|---|---|---|
| Price | **₹0**. Standard parameters, default KMS key, standard API throughput: free. | **$0.40 per secret per month** + $0.05 per 10k calls. Seven secrets (six services + webhook) ≈ **$2.80 ≈ ₹240/month**; calls negligible (read at boot). |
| Size limit | 4 KB standard (8 KB advanced, $0.05/param) | 64 KB |
| Rotation | None built in | Built in — but needs a Lambda per secret and a provider that supports it. Anthropic, Razorpay and the JWT secrets do not rotate programmatically; Atlas could. We would not use it. |
| Cross-account / replication | No | Yes — we have one account. |
| IAM, audit, encryption at rest, no file on disk | Same | Same |

**Ruling: Parameter Store now.** It gives the thing the founder actually wants — no `.env.production` on any disk, secrets injected by role, audited by CloudTrail, scoped per environment — for ₹0. Secrets Manager adds rotation and replication we cannot use yet. The loader is written so switching is one config line (`SECRETS_BACKEND=ssm|secretsmanager`) if that changes. Secrets are still created by the founder in the console; no AI session ever holds them.

## Monthly cost of a production environment (the part nobody asked about but matters more)

| Line | Choice | ₹/month |
|---|---|---|
| Prod compute | t3.small (2 vCPU, 2 GB) ≈ $16.4 — tight for six Node containers + nginx + Chromium; **t3.medium (4 GB) ≈ $33** recommended | **1,400 – 2,800** |
| Image registry | ECR, ~5 GB kept (last 5 tags, lifecycle policy), $0.10/GB; pulls in-region free | ~45 |
| CI minutes | GitHub Free: 2,000 min/month private. Six images with cache ≈ 15–25 min per `main` merge; 10 merges ≈ 250 min on top of today's CI. Overage $0.008/min if ever | 0 (today) |
| Secrets | Parameter Store | 0 |
| Secrets (if Secrets Manager) | 7 secrets | 240 |
| Database | T-403 says new credentials; a free M0 Atlas cluster is not for production (no backups, 512 MB). **M10 ≈ $57** | **~4,900** |
| Redis | A Redis container on the same box: ₹0. ElastiCache t4g.micro ≈ $12 | 0 – 1,000 |
| Elastic IP, 20 GB EBS | EIP free while attached; EBS gp3 ≈ $1.6 | ~140 |
| **Total** | t3.medium + ECR + Param Store + M10 + on-box Redis | **≈ ₹7,900 ($93)** |
| Minimum | t3.small + M0 kept for a closed pilot only (Vikram/Ajay to accept the no-backup risk) | ≈ ₹1,600 |

The free tier's 750 instance-hours cover one t3.micro only; the dev box uses them. A second box is paid from day one, whenever it starts. Also check when the account's 12-month free tier ends — the dev box becomes ≈ ₹700/month then.

## Effort

- Pipeline: ~2 lead-days (workflow, compose file for prod, SSM deploy, rollback, docs). Root config and CI files: one lead, one ticket.
- Secrets loader: ~1 lead-day (`packages/shared`, six boot sites, tests with a stubbed client). One ticket, `packages/shared` claim.
- Founder console work (~1 hour, with Kunal's step-by-step as for SES): ECR repositories, OIDC provider + role for GitHub, instance role, the `/lawie/prod/*` parameters, one t3.medium with Docker, the Atlas M10.

## Now or after phase 2?

**Now — before the first production release, which is before phase 0 of v2 even starts** (D9: phase 0 begins after T-403). Reasons:

1. Production does not exist yet. A box born from an image and a role never needs migrating; a box born from `git pull` and an env file has to be rebuilt later while users are on it. The cheapest time to containerise prod is before there is a prod.
2. T-403 already demands a fresh environment, all-new secrets, nothing on disk reused, a rollback tried. The pipeline and the loader *are* that work; doing T-403 by hand and then automating it is paying twice.
3. The risk is the opposite of what it looks like: the manual path (copy env file, `git pull`, `pm2 restart`) is what produced the over-privileged bot user and a 157-day-old key. Automation removes the hands.
4. It does not touch product code or Anushka's batch. One lead, two tickets, in parallel with the v1 polish tickets.

Not now: Kubernetes, Secrets Manager rotation, ElastiCache, multi-AZ. Revisit when there is paying load.

**Decision needed from the founder:** (a) go now with Parameter Store, ₹≈7,900/month at the recommended size (Vikram verifies), or (b) go now at the ₹1,600 minimum with the M0 risk accepted in writing, or (c) wait. On (a) or (b) Priya posts T-533 (pipeline) and T-534 (secrets loader) and Kunal writes the console steps.

## Vikram's corrections (21 Oct 2026) — these supersede the table above

Checked against list prices, not live; the founder reads Atlas off the cluster builder before buying.

- **Public IPv4 is charged** since Feb 2024: $0.005/h ≈ $3.65 ≈ ₹310/month per address, Elastic IPs included. The free tier covers one; the dev box uses it.
- EBS gp3 Mumbai ≈ $0.091/GB → 20 GB ≈ ₹155.
- **Atlas M10 in AWS Mumbai ≈ $60–66** (₹5,100–5,600) before backup storage and transfer.
- Add a 3–4 % FX/card buffer; AWS India bills 18 % GST, Atlas is GST under reverse charge — both input credit, cash out first.

**Corrected totals, before GST:** recommended (t3.medium + M10 + on-box Redis + Parameter Store) ≈ $100 ≈ **₹8,500–8,900**; minimum (t3.small + M0) ≈ **₹1,900**.

**Finance calls (Vikram):**
- Parameter Store over Secrets Manager: agreed.
- **No M0 for prod** — no backups, and it holds client drafts; one loss event costs more than a year of M10. But M10 with zero paying users is the wrong spend. **Middle: Atlas Flex** (the paid shared tier that replaced M2/M5): ≈ $8 base capped at $30, 5 GB, daily backups ≈ ₹700–2,600. Move to M10 near the 5 GB/ops limit or past ~10 Solo subs/month. Arjun confirms Flex exists in ap-south-1 and that its snapshot/restore satisfies T-403's rollback rule.
- **Launch line with Flex: t3.medium + Flex + IPv4/EBS/ECR ≈ ₹3,600–5,600/month.** Vikram's recommendation given no spare cash.
- **Timing: build now, buy late.** Post T-533/T-534 now; launch the prod box and database a few days before T-403, not at ticket start — an idle month is ≈ ₹3,000.
- Free-tier end: the dev box then adds ≈ ₹700 + ₹310 IPv4.

**Arjun on the Flex rollback question:** Flex takes daily snapshots with point-in-time restore absent; restore is to a new cluster, then the connection string changes — acceptable for T-403's "rollback written and tried" if the tried rollback is *application* rollback (retag image) plus a *data* restore drill done once from a Flex snapshot, with the restore time written down. If Flex is not offered in ap-south-1 on the day, M10 is the only honest choice; the founder sees that in the cluster builder.

**Open for Ajay:** M0 (no backup) vs Flex (daily backup) for client drafts under DPDP — asked 21 Oct. Founder decides after.

## Ajay (21 Oct 2026) — ruling on the prod database

Full ruling: `handoff/legal/AJ-prod-db-backup-ruling.md` (08718769). Summary: **M0: no, once anyone pays. Flex: OK for the pilot** on five conditions — (a) privacy policy §3 "We do not currently keep backups" is replaced with Ajay's signed line in the same release; (b) snapshot retention 7 days or less, matching the erasure promise; (c) snapshots stay in Mumbai; (d) a restore drill is timed; (e) any loss event escalated to Ajay the same day. M10 point-in-time restore is not legally required yet.

## Decision (ready for the founder)

Engineering, finance and legal agree: **build now, buy late; t3.medium + Atlas Flex + Parameter Store; ≈ ₹3,600–5,600/month before GST**, bought a few days before the T-403 release. On the founder's "go": Priya posts T-533 (pipeline: build → ECR → SSM deploy → rollback) and T-534 (secrets loader, `packages/shared`); the privacy §3 line and Ajay's conditions (a)–(e) go into T-403's acceptance criteria; Kunal writes the console steps (ECR, OIDC role, instance role, `/lawie/prod/*` parameters, Flex cluster with 7-day retention in Mumbai).

## Founder decision (21 Oct 2026): build now, buy later, with a switch

"It must have a switch to enable and disable the pipeline — continue doing the same until we have a finished product and really decide to start the pipeline."

### The switch (Arjun's design for T-533)

Two GitHub **repository variables** (Settings → Secrets and variables → Actions → Variables; the founder flips them, no code change, no redeploy):

| Variable | Off (default, absent) | On (`true`) |
|---|---|---|
| `PIPELINE_BUILD_ENABLED` | A push to `main` builds nothing and pushes nothing. ECR stays empty, ₹0. | Build the six images, push to ECR tagged `sha-<commit>` and `main`. |
| `PIPELINE_DEPLOY_ENABLED` | No deploy step ever runs. The box, if any, keeps whatever it has; manual deploy as today. | After a green build, SSM Run Command → `docker compose pull && up -d`, health wait, rollback on failure. |

Rules:
- Both checks are job-level `if: vars.X == 'true'` in `deploy-production.yml`, so a merge to `main` with the switches off produces one skipped run and nothing else — exactly "continue doing the same".
- Deploy requires build on: `PIPELINE_DEPLOY_ENABLED=true` with build off does nothing and prints why.
- A third guard, independent of the variables: the deploy job targets a GitHub **environment** `production` with a required reviewer — the founder. Even with both switches on, the first deploy to a box waits for his click. He can remove the reviewer later when he trusts the pipeline.
- `workflow_dispatch` stays for a manual run with inputs `action: build|deploy|rollback` and `sha`; it respects the same two variables.
- Nothing in the workflow references `.env*` files; secrets come from Parameter Store on the box (T-534) and OIDC in Actions. No AWS access key is stored in GitHub.
- The dev box is untouched by T-533 and T-534. It keeps `git pull` + pm2 until the founder flips a separate `PIPELINE_DEV_ENABLED` — a later ticket, not now.

### Tickets
- **T-533 — pipeline** (root config + CI; one lead): workflow, `docker-compose.prod.yml`, SSM deploy + health wait + rollback, the two switches and the environment gate, `docs/DEPLOY.md` written (it is empty today). AC: with both variables absent a push to `main` is a skipped run; with build on and deploy off, images land in ECR and nothing else happens; rollback tried against the demo compose locally.
- **T-534 — secrets loader** (`packages/shared`; one lead): `loadSecrets()` reads `/lawie/<env>/<service>` JSON from Parameter Store by instance role when `SECRETS_BACKEND=ssm`, else the environment as today; one call at each of the six boot sites; stubbed-client tests; `SECRETS_BACKEND` absent = today's behaviour, so nothing changes until the prod box exists.
- **Kunal — console steps**, written now, executed when the founder says "buy": ECR repositories with a 5-tag lifecycle policy, GitHub OIDC provider + role, instance role (ECR pull + `ssm:GetParameter` on `/lawie/prod/*`), the parameters, `production` environment with the founder as reviewer, the two variables (left absent), t3.medium with Docker, Atlas Flex in ap-south-1 with 7-day retention. The founder enters every secret value himself.
- **T-532** (Priya): privacy §3 ships with the Flex cluster.

## Founder rule (21 Oct 2026): no handoff docs in production, not even on `main`

Audit today: `.dockerignore` excludes `docs/` (except `docs/templates`), `scripts/`, `team-warroom/` and env files — but **not** `handoff/`, `.claude/`, `CLAUDE.md` or `.github/`. Five service Dockerfiles copy only their own app and `packages/*`, so they are clean; **`apps/web/Dockerfile` does `COPY . .`**, so the web image would carry every handoff ticket, the claim record and the agent prompts today. The dev box is a git checkout, so the files are on its disk too (nginx does not serve them, but they are there).

Ruling, three layers, each enough on its own:

1. **Images (T-533, first commit):** add to `.dockerignore`: `handoff/`, `.claude/`, `CLAUDE.md`, `.github/`, `**/*.md` (then re-allow nothing — no Markdown is read at runtime; `docs/templates` is JSON). Change `apps/web/Dockerfile` from `COPY . .` to the explicit copies the other five use (`apps/web/`, `packages/shared/`, root `package.json`/`yarn.lock`). AC: `docker build` of each image followed by `docker run --rm <image> sh -c 'ls /app'` shows no `handoff`, `.claude`, `CLAUDE.md`; a test in the T-533 workflow greps the image filesystem for `handoff/` and fails the build if found.
2. **`main` (T-403 and T-533):** `main` is not a merge of `develop`; it is a **release snapshot**. A `release-to-main.yml` workflow (`workflow_dispatch`, `production` environment, founder as reviewer, input `version`) checks out `develop`, removes `handoff/`, `.claude/`, `CLAUDE.md`, `.github/copilot-instructions.md`, commits the tree onto `main` as `release: v<version> from develop@<sha>`, tags it, pushes. No one merges into `main` by hand. The commit message carries the `develop` SHA, so the source is always traceable. Hotfixes still flow `develop_staging → develop → release`, never to `main` directly (branch rule unchanged).
3. **Guard on `main` (T-533):** a `main-guard` job in CI, on every push to `main`: fails if `handoff/`, `.claude/` or `CLAUDE.md` exist in the tree. Branch protection on `main` requires it. If the founder ever merges by hand, the guard goes red before the pipeline builds — the deploy job also depends on it.

The dev box: when T-533's pipeline is later turned on for `develop`, the box runs images, not a checkout, and the files leave its disk. Until then they stay there, unserved; acceptable, noted.

T-403's AC line "`develop` is merged to `main`" is amended to "`main` is cut from `develop` by the release workflow".
