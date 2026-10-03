# Local Setup — Findings & Decision Brief

_Prepared 2026-08-04. Nothing has been changed on your machine or the server. This is read-only analysis so you can decide._

---

## TL;DR

**Your local repo was not lost.** It is clean, complete, and **newer than production**. The plan of "copy the server's branch down to local" would move you _backwards_ by 7 merge commits.

The thing that's actually broken is **local tooling and infrastructure**, not code:

- `yarn` is not installed (the repo is a yarn-workspaces monorepo)
- No MongoDB or Redis locally, and no Docker to run them
- Node is v22 (server runs v20) — you've asked me to align this to 20
- Nothing has been built yet (`dist/`, `.next/` absent)

**One decision is needed from you** — see [Decision](#the-decision) at the bottom.

---

## 1. Git: server vs local

|            | Branch                | HEAD      | Date   | Remote                            |
| ---------- | --------------------- | --------- | ------ | --------------------------------- |
| **Server** | `fix/branding-assets` | `9459a72` | Jun 23 | `github.com/abhinava32/lawie.git` |
| **Local**  | `develop`             | `2c599fc` | Jun 24 | `github.com/lawie-in/lawie.git`   |

Verified by `git merge-base --is-ancestor`:

- `9459a72` **is an ancestor of** `2c599fc` → your local `develop` already **contains** everything on the server.
- Commits the server has that local lacks: **none.**
- Commits local has beyond the server: **7**, all merges into `develop` —

  ```
  2c599fc  Merge PR #26 from fix/branding-assets
  e6454ab  Merge PR #24 from fix/branding-assets
  8fdf285  Merge PR #22 from smtp_setup
  2587632  Merge PR #20 from smtp_setup
  31f22d9  Merge PR #18 from smtp_setup
  7cfb414  Merge PR #16 from smtp_setup
  a3efe6d  Merge PR #14 from smtp_setup
  ```

**Local working tree is clean** — 0 modified files, 0 stashes. Nothing to recover.

### Two anomalies worth knowing

**a) The server is on the wrong branch relative to its own deploy script.**
[`deploy.sh`](deploy.sh) line 14 runs `git pull origin main`, but the server's checked-out branch is `fix/branding-assets`. Someone deployed by hand and left it there. The server also has uncommitted drift:

```
 M apps/web/next-env.d.ts
 D apps/web/public/assets/lawie_hero_banner_1200x600.svg   ← deleted, not committed
 D apps/web/public/assets/lawie_wordmark_logo.svg          ← deleted, not committed
?? loader.js      ← hand-written env shim, untracked
?? start.sh       ← hand-written env shim, untracked
```

Those two deleted SVGs exist in your local repo. **Production is missing branding assets that local has.**

**b) The remotes differ.** Server points at a personal fork (`abhinava32/lawie`); local points at the org (`lawie-in/lawie`). PRs merge into the org repo, so **local's remote is the canonical one.**

---

## 2. The `.env` situation — the important part

Last turn I copied `.env.demo` down. It turns out that is **not** what the server runs on. Both `loader.js` and `start.sh` on the server source **`.env.production`**, as does [`ecosystem.config.js`](ecosystem.config.js) (`ENV_FILE = '/home/ubuntu/lawie/.env.production'`).

Your local `.env.production` is already **byte-identical** to the server's (md5 `623ed700…`). Nothing to fetch.

### But your local `.env` and the server's `.env.production` are different _generations_ of config

| Only in local `.env`                                                                                                                                                                         | Only in `.env.production`                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `AWS_SES_ACCESS_KEY_ID` / `_SECRET_ACCESS_KEY`                                                                                                                                               | `AWS_ACCESS_KEY_ID` / `_SECRET_ACCESS_KEY`                                              |
| `EMAIL_PROVIDER=ses`, `EMAIL_DRY_RUN`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`, `EMAIL_REPLY_TO`, `EMAIL_FOUNDER`, `EMAIL_QUEUE_PREFIX`, `EMAIL_WORKER_CONCURRENCY`, `EMAIL_DEV_REDIRECT_TO` | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `GOOGLE_APP_PASSWORD` |
| `MONGO_ROOT_USER/PASS`, `ECR_REGISTRY`                                                                                                                                                       | `CODECOV_TOKEN`, `RAZORPAY_WEBHOOK_URL`                                                 |

Read that table carefully: **local `.env` is the newer, SES-based config; `.env.production` is the older SMTP-based one.** That matches the git history exactly — the `smtp_setup` PRs (#14–#22) that migrated email to SES are merged into local `develop` but are _not_ on the server's branch.

**Conclusion: your local `.env` is correctly paired with your local code. It is not stale, and it should not be overwritten with `.env.production`.** Doing so would break the email-worker, which now expects `EMAIL_PROVIDER` / `AWS_SES_*`.

### Infrastructure targets

|                 | local `.env`                      | `.env.production`                         |
| --------------- | --------------------------------- | ----------------------------------------- |
| `MONGO_URI`     | `mongodb://localhost:27017/lawie` | MongoDB Atlas (`lawie-prod.…mongodb.net`) |
| `REDIS_URL`     | `redis://localhost:6379`          | Redis Cloud (`…db.redis.io:14900`)        |
| `FRONTEND_URL`  | `http://localhost:3000`           | `https://lawie.in`                        |
| `NODE_ENV`      | `development`                     | `production`                              |
| `EMAIL_DRY_RUN` | `true`                            | —                                         |

Your local `.env` is already **correctly configured for local development**. It expects Mongo and Redis on localhost — which is the gap below.

> ⚠️ `EMAIL_DRY_RUN=true` in local `.env` is a safety net — it stops real mail going to real users during a dry run. Leave it on.

---

## 3. What's actually missing locally

| Item                       | Local                          | Server             | Blocking?                                                                           |
| -------------------------- | ------------------------------ | ------------------ | ----------------------------------------------------------------------------------- |
| Node                       | v22.23.1                       | v20.20.2           | Aligning to 20 (your call, already made)                                            |
| yarn                       | **not installed**              | 1.22.22            | **Yes** — `package.json` requires `yarn >=1.22`, all scripts are `yarn workspace …` |
| `node_modules`             | present (898 pkgs)             | present            | Suspect — likely npm-installed; needs a clean yarn install                          |
| MongoDB                    | **not installed, :27017 down** | remote Atlas       | **Yes**                                                                             |
| Redis                      | **not installed, :6379 down**  | remote Redis Cloud | **Yes**                                                                             |
| Docker                     | **not installed**              | not used (PM2)     | Only if you want containerised Mongo/Redis                                          |
| Builds (`dist/`, `.next/`) | **absent**                     | present            | Yes, for a prod-mode run                                                            |
| Homebrew                   | ✅ installed                   | —                  | —                                                                                   |
| nvm                        | ✅ available                   | —                  | —                                                                                   |

**Services and ports** (from local `.env`): gateway `4000`, auth `4001`, drafting `4002`, billing `4003`, web `3000`, plus the email-worker (no HTTP port).

The server runs all six under PM2, all `online`, uptimes 41–47 days.

---

## 4. Two ways to get Mongo + Redis locally

Your local `.env` points at `localhost`, so you need both running. Options:

**A. Homebrew (no Docker needed)** — you already have brew.
`brew install mongodb-community redis` then start both as services. Lightest path, native, survives reboots.

**B. Docker Compose** — the repo already ships [`docker-compose.yml`](docker-compose.yml).
Requires installing Docker Desktop first (~1 GB). Better isolation and closer to how the repo intends it, but heavier.

I'd suggest **A** — you need it working, not containerised, and Docker isn't installed.

> A third option — pointing local at the **production** Atlas/Redis — is possible but I'd advise against it: a local dry run would read and write **live customer data**.

---

## The decision

Everything above is settled except one thing:

### Which branch should local be on for the dry run?

**Option 1 — stay on `develop` (recommended).**
Newest code. Contains everything on the server plus the SES email migration and branding fixes. Your local `.env` is already the matching SES-era config, so the two line up with no further work. This is the right choice if you're **resuming development**.

**Option 2 — check out `fix/branding-assets` @ `9459a72` to mirror production 1:1.**
Only sensible if you specifically need to **reproduce a production bug**. Costs: you drop 7 merge commits' worth of code, _and_ your local `.env` no longer matches the code (the old branch expects `SMTP_*`, your `.env` provides `AWS_SES_*`), so you'd have to swap env files too. More work, older code.

**My recommendation: Option 1.** The server being behind isn't something to replicate — it's drift that should eventually be fixed by deploying `develop` _to_ the server.

---

## Proposed plan once you decide (nothing runs until you say go)

1. Install Node 20.20.2 via nvm, pin with `.nvmrc`
2. Install yarn 1.22
3. Delete `node_modules`, clean `yarn install --frozen-lockfile`
4. `brew install mongodb-community redis`, start both
5. Build shared packages, then `yarn workspaces run build`
6. Dry run: `yarn dev`, confirm all six services boot and the web app answers on :3000
7. Report what passes and what fails

**Open question for step 4:** your local Mongo will be empty. Production data lives in Atlas. Do you want an empty local DB (fine for a smoke test), or a seeded/imported one? Tell me which and I'll handle it.

---

_Files I created this session: `.env.demo` (fetched from server — turned out to be the wrong env file; safe to delete) and this document. No existing file was modified._
