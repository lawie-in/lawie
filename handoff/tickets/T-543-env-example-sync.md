# T-543 — Bring `.env.example` up to date and keep it the single list of variable names

- **Status:** Building (Vishal, branch fix/t-543-env-example, 21 Oct 2026)
- **Owner:** Vishal (build). Priya assigns. Arjun reviews any secret-handling comment.
- **Mode:** Small fix. No product code changes, so no UI, no legal content.
- **Files held:** `.env.example`, `apps/web/Dockerfile`, `docker-compose.demo.yml`, `docker-compose.staging.yml`, `docker-compose.yml` (extended 21 Oct 2026, see "Build-time web variables"). Anything else: ask Priya first.

## Why

Founder, 21 Oct 2026: he sets every environment value himself, so he must know each new variable name **before** a deploy. `.env.example` is where the names live, and it is out of date. It is the single list; there is no second one.

## What to do

1. Read the code, the compose files (`docker-compose*.yml`), and the workflows for every variable each service reads. Do not trust this ticket's scan alone; it matched `process.env.X` and can miss config modules and destructuring.
2. For each variable, make `.env.example` hold: name, a **placeholder or empty value, never a real value**, one comment line saying what it is, which service reads it, whether it is secret or public, required or optional, and the prod rule where there is one.
3. Group by service so the founder can read it top to bottom.
4. Remove or mark dead ones. Do not guess: if a variable looks unused, ask Priya or the owner of that area.

## A first scan (21 Oct 2026, to check, not to copy)

**Read in code, missing from `.env.example`:** `DRAFTING_INTERNAL_URL`, `GST_ADDRESS`, `GST_EFFECTIVE_FROM`, `GST_GSTIN`, `GST_LEGAL_NAME`, `GST_SIGNATURE_PATH`, `GST_STATE_CODE`, `GST_TRADE_NAME`, `INVOICE_EMAIL_ENABLED`, `NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME`, `NEXT_RUNTIME`, `PORT`, `PUPPETEER_EXECUTABLE_PATH`, `RAZORPAY_PLAN_ID`, `SMTP_HOST`, `SMTP_PASS`, `SMTP_PORT`, `SMTP_USER`, `UNVERIFIED_SWEEP_ENABLED`.

**In `.env.example`, not seen in the code:** `AUTH_PORT`, `BILLING_PORT`, `DRAFTING_PORT`, `ECR_REGISTRY`, `EMAIL_FOUNDER`, `GATEWAY_PORT`, `MONGO_ROOT_PASS`, `MONGO_ROOT_USER`. Some may be used only by compose. Check before removing.

**Also check, set by other tickets:** `RAZORPAY_KEY_GUARD` (prod: `strict`), `RAZORPAY_ALLOW_TEST_KEYS` (absent on prod), `SECRETS_BACKEND` (T-534), the plan ids, the SES settings, the `FEATURE_DEFAULT_*` flags, and the Razorpay live-mode webhook secret.

`NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME` must carry this comment: build-time, rebuild web after setting, unset shows "For complaints, write to contact@lawie.in." (AJ-517-M21). No name in the file.

## Acceptance criteria

1. Every variable the code, compose files, and workflows read appears in `.env.example` exactly once, with a comment as in step 2.
2. No real value, key, token, or secret appears anywhere, and gitleaks passes.
3. The `NEXT_PUBLIC_*` variables are marked as build-time.
4. A short list at the end of your READY: variables added, variables removed, and any you were unsure about.
5. Each service still boots from the file's placeholders in dev (`yarn` dev start or compose) as it did before, or you say which cannot.

## Build-time web variables (added 21 Oct 2026)

Web is built in Docker. `apps/web/Dockerfile` passes only `NEXT_PUBLIC_API_URL` as a build ARG, so a `NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME` set in `.env.demo` is not seen by `next build`, and the footer would keep the fallback. Fix: add the ARG/ENV to the Dockerfile and pass it in the `build.args` of every compose file that builds web, read from the compose project `.env` with an empty default (`${NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME:-}`). Note in `.env.example` that every `NEXT_PUBLIC_*` variable needs this ARG plus a web rebuild (`docker compose ... up -d --build web`). Check every other `NEXT_PUBLIC_*` the code reads for the same gap. The tester proves it with a build that shows the name in the rendered footer, using a dummy name.

## Out of scope

Changing how any service reads its config, renaming a variable, moving secrets to Parameter Store (T-534), real values.

## Going forward

A ticket that adds, renames, or removes a variable updates `.env.example` in the same branch and lists the change in READY. Priya tells the founder the new names before the deploy.
