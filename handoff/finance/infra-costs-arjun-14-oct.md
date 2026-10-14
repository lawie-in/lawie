# Infra cost sheet for the financial model (Arjun, 14 Oct 2026)

For Vikram. Read-only survey of the repo (`docker-compose.*.yml`, `deploy.sh`, workflows, `README.md`, `T-003` token design) plus public price lists. **G** = guess, **F** = fact from repo or vendor page. INR at ₹88/$. Everything here excludes GST unless said.

## 1. Recurring, now (develop / staging)

| Item | Provider, plan | ₹/month | Basis |
| ---- | -------------- | ------: | ----- |
| Server for gateway, auth, drafting, billing, email-worker, web, nginx | AWS EC2 t3.medium, ap-south-1, one box, Docker Compose + pm2 (F) | 2,600 | $0.0416/hr on-demand; README says ₹2,100 (reserved or savings plan). Add EBS 30 GB ≈ ₹260 |
| Container registry | AWS ECR (F) | 100 | storage only (G) |
| Mongo | Atlas M0 `lawie-dev`, Mumbai (F) | 0 | no backups |
| Redis | not in the prod compose file → runs on the box or a hosted free tier; **provider to confirm with the founder** (the "remove REDIS_URL from lead env" item says a hosted URL exists) | 0 | G |
| Email | AWS SES, Mumbai, out of sandbox 14 Oct (F) | 0 | $0.10 per 1,000 mails |
| Errors | Sentry, free developer tier (F: `@sentry/node`, `@sentry/nextjs`) | 0 | 5k errors/month free; Team is $26/month if we exceed |
| Domain, DNS, SSL | `lawie.in` + Let's Encrypt via certbot (F) | 70 | ≈ ₹800/year domain; DNS at registrar/Cloudflare free |
| CI | GitHub Actions (F: `ci.yml`, deploy workflows) | 0–1,800 | 2,000 free minutes/month on a private repo; six workspaces per push, five leads merging → likely over the free pool. Overage $0.008/min. **G** |
| Golden set (real model) | Anthropic, nightly + on push when golden paths change (T-376) | 0 today → ~13,000 if nightly real runs start | 30 fixtures × ~₹15 each × 30 nights. **G**; the secrets are not set yet, so ₹0 now |
| Dev/test Anthropic calls | leads' crews and tests use recorded replies; a few real calls | 500 | G |
| Monitoring, logs | CloudWatch basic, pino to disk (T-247) | 0–100 | G |
| **Total now** | | **≈ ₹3,500–5,000** (≈ ₹18,000 if the nightly golden set runs for real) | |

Not infra, listed so they are not forgotten: Claude Code / Anthropic seats for the team (founder's subscription), Google Workspace, Razorpay fees (per transaction, section 4).

## 2. Recurring, at prod launch (adds to section 1; develop stays)

| Item | Provider, plan | ₹/month | Basis |
| ---- | -------------- | ------: | ----- |
| Prod server | second EC2 t3.medium (or t3.large ≈ ₹5,200), separate from develop | 2,600–5,200 | F price, G size |
| Prod Mongo | Atlas M10 Mumbai, daily snapshots, 7-day retention | 6,500 | approved by Vikram 14 Oct |
| Prod Redis | hosted (Redis Cloud 250 MB ≈ $5) or on the prod box | 0–450 | G; `noeviction` is on the founder list either way |
| Secrets | AWS Secrets Manager (README: CI writes `.env.production` from it), ~25 secrets × $0.40 | 900 | F price, G count |
| Email | SES, ~5 mails per user per month | 0–100 | |
| Sentry | likely still free; Team if volume grows | 0–2,300 | |
| Alarms | CloudWatch (SES reputation, EC2, Atlas billing alerts are free) | 100 | |
| Backups | Atlas snapshot storage | <450 | tiny data |
| **Total fixed at launch** | | **≈ ₹11,000–16,000** on top of section 1 | |

## 3. Anthropic, per draft (the variable cost) — before Anushka's run, all **G**

Models by flow, all set in admin AI config (no default in code): `ai.intake_model` = Haiku 4.5 ($1 / $5 per MTok), `ai.drafting_model` and `ai.preflight_model` = Sonnet 4.6 class ($3 / $15). **Nothing uses prompt caching today** (T-003 note; zero `cache_control` in drafting) — that is the main lever below.

One real data point in the repo (T-003, 3 Oct): a 1-Ink `affidavit_identity` on Haiku = 1,599 in / 907 out = $0.0061 ≈ ₹0.55.

| Draft | Calls | Tokens (G) | $ | ₹ |
| ----- | ----- | ---------- | -: | -: |
| 1-Ink affidavit (Haiku) | 1 draft + 2–3 intake | ~6k in / 1.5k out | 0.012 | ~1 |
| 2-Ink bail / petition (Sonnet), **no caching** | ~8–10 Haiku intake + 1 preflight + 1 draft (~14k-token prompt: rules pack 18 KB + prompts 36 KB) + verifier | ~20k Haiku in, 3k out; ~24k Sonnet in, 4k out | 0.02 + 0.13 = **0.15** | **~13–15** |
| same, **with prompt caching** on the static rules + system prompt (cache read $0.30/MTok) | same | Sonnet uncached in drops to ~6k | ~0.09 | **~8** |
| regenerate / add-section (charged again per T-388) | 1 Sonnet call | ~16k in / 2k out | 0.08 (0.04 cached) | 7 (3.5) |

Against Vikram's thresholds (net ₹9.19 per Ink → ₹18.38 per 2-Ink draft): break-even holds today (~₹14); the 60% margin target (< ₹7.40) needs prompt caching, or Sonnet 5.5 at $2 / $10 (−33%), or both (~₹5). **Decision for me after Anushka's data; caching is a one-ticket change in `ai.service.ts`.**

Per paying user per month, assuming 60% of plan Ink is used, all on 2-Ink drafts (worst case):

| Plan | Ink used | Drafts | ₹ no cache | ₹ cached |
| ---- | -------: | -----: | ---------: | -------: |
| Solo (50 Ink) | 30 | 15 | 225 | 120 |
| Pro (150 Ink) | 90 | 45 | 675 | 360 |

## 4. Scaling (G)

Mix assumed 70% Solo / 30% Pro → ≈ ₹360/user/month no cache, ≈ ₹190 cached.

| Paying users | Fixed infra ₹/month | Anthropic ₹/month (no cache → cached) | Notes |
| -----------: | ------------------: | ------------------------------------: | ----- |
| 100 | 15,000–20,000 | 36,000 → 19,000 | one prod box + M10 is enough |
| 500 | 25,000–35,000 | 180,000 → 95,000 | t3.large or two boxes, M10→M20 (~₹17k), hosted Redis, Sentry Team |
| 2,000 | 60,000–90,000 | 720,000 → 380,000 | two app boxes + load balancer (~₹2k), M30 (~₹35k), Redis, log/metrics tooling; Anthropic rate-limit tier rises with spend automatically |

Anthropic is 70–90% of cost at every size; infra never is. Razorpay: 2% + GST per transaction (no fixed fee), model it on revenue.

## 5. One-time (capex-like), all G except where marked

| Item | ₹ | Note |
| ---- | -: | ---- |
| DSC for the proprietor (GST filings, contracts) | 1,500–3,000 | |
| VAPT / security audit before taking paying lawyers' data | 50,000–1,50,000 | optional pre-v1; Ajay's call on whether DPDP needs it for v1. I recommend one external VAPT before launch |
| Legal docs (ToS, privacy, refund) | 0 | done in-house by Ajay |
| Paid tools | 0 | none required; Helicone not now (founder) |
| Apple/Google developer accounts | 0 | no apps in v1 |
| Prod setup labour | 0 | founder + me, T-403 |

## 6. What changes these numbers

1. Anushka's run with rates set → replaces every G in section 3 with measured avg/p90 per draft.
2. Prompt caching ticket → halves Sonnet input cost.
3. Golden-set secrets → +₹13k/month if nightly stays on; I will gate it to "on push when golden paths change" plus one weekly run if the bill matters (T-376 keeps the nightly for now).
4. CI minutes: check the Actions usage page once; if over 2,000/month, GitHub Team ($4/user) or path-filtered jobs (already partly done).
