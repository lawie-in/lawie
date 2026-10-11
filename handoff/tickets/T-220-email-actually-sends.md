# T-220 — Emails actually reach users

| Field          | Value |
| -------------- | ----- |
| Phase          | 0 — Prep |
| Owner          | Arjun (provider, domain, deploy; ADR if not already recorded). Founder (DNS and AWS account access). Lead (build). Anushka (verdict) |
| Mode           | Arjun's call first, then build, full chain (email-worker, infra) |
| Status         | Needs scoping. Waits for Arjun |
| Size           | Arjun S. Build M |
| Depends on     | None |
| Gate           | Before v1 go-live (T-403). T-221 and T-222 cannot send for real without it |
| Branch         | feature/t-220-email-sends |
| Legal sign-off | Through T-225 (content rules, privacy policy line for the provider) |
| Created        | 2026-10-11 |
| Source         | Founder asked for email scope, 11 Oct 2026. Priya's survey of `apps/email-worker` and `packages/email-client` |

## Problem

`apps/email-worker` and `packages/email-client` exist (queue, SES/SMTP/dry-run providers, one `auth.welcome` stub), but no service calls `enqueue`, and nothing says where the worker runs or which domain it sends from. Today no user receives any email.

## Acceptance criteria

1. Arjun records the provider (SES is the code default), the sending domain and from-address, and where the worker runs, in an ADR or a note in this file.
2. The sending domain has SPF, DKIM and DMARC records; mail to Gmail and Outlook lands in the inbox, not spam (lead's report shows the headers pass).
3. SES is out of the sandbox for the prod account, or the founder decides otherwise.
4. The worker runs next to the other services on develop, reads its queue from the same Redis, and retries a failed send with backoff. A job that keeps failing is kept for `scripts/replay.ts`, not lost.
5. Local and CI use `EMAIL_PROVIDER=dry-run`; no test sends real mail.
6. Logs and Sentry hold the template id and a user id, never the address or the body (same rule as T-210).
7. CI green on email-worker and email-client.

## Out of scope

- Which emails are sent (T-221, T-222, T-224)
- `drafting.draftComplete` and the three `admin.*` templates: not in v1 unless Priya re-scopes
- Marketing email

## References

- `apps/email-worker/src/config/env.ts`, `packages/email-client/src/index.ts`
- T-210, T-225

## Arjun (11 Oct 2026)

Read-only survey of `apps/email-worker`, `packages/email-client`, `deploy.sh`, `ecosystem.config.js`, the compose files and `LOCAL-SETUP-DECISION.md`. Nothing run on the server.

**Decision (AC1)**

| Item | Decision |
| ---- | -------- |
| Provider | AWS SES v2 (`@aws-sdk/client-sesv2`), region `ap-south-1` (Mumbai). Same region as the EC2 host; keeps mail metadata in India. SMTP and Gmail app password are not used for user mail. |
| Sending domain | `lawie.in`, verified as a domain identity in SES with Easy DKIM (2048-bit). Custom MAIL FROM `mail.lawie.in` so SPF aligns without touching the root SPF record that Google Workspace uses. |
| From | `Lawie <noreply@lawie.in>` (code default, keep). |
| Reply-To | `contact@lawie.in` (code default). Must exist as a Google Workspace alias before go-live, or replies bounce. |
| Where the worker runs | `develop` today runs on one EC2 host in ap-south-1 (`deploy.sh`), all services under pm2. The worker is already in `ecosystem.config.js` as `lawie-email-worker`, built by `deploy.sh`, and reads `REDIS_URL` from the same `.env.production`, so it shares the Redis Cloud instance with the services. No separate prod env exists yet; when it does, it runs the same way (pm2 next to the services, its own Redis). `docker-compose.prod.yml` / `.staging.yml` (ECR images) do not list the worker and are not what deploys today; do not build on them. |
| Credentials | Dedicated IAM user `lawie-ses-sender`, policy limited to `ses:SendEmail` on the `lawie.in` identity, keys in the server's `.env.production` as `AWS_SES_ACCESS_KEY_ID` / `AWS_SES_SECRET_ACCESS_KEY`. Instance role is better but needs an adapter change; not in v1. |
| Bounces/complaints | SES account-level suppression list on (bounce + complaint). No SNS handler in v1. |
| Develop vs local | Local and CI: `EMAIL_PROVIDER=dry-run`. Develop: real SES, no `EMAIL_DEV_REDIRECT_TO`, so Anushka receives mail at the address she signs up with (develop has no real users). |
| DMARC | Start `p=none` with reports to `contact@lawie.in`; move to `p=quarantine` after two clean weeks. |

**ADR or note:** this note is enough. It confirms what the code already chose (SES, ap-south-1, `noreply@`/`contact@`); no new architecture. Revisit with an ADR only if we add a second provider or move off the single EC2 host.

**Existing ADR search:** none covering email in `docs/` or `handoff/`. `env.ts` cites "ADR-007 §6", but no ADR-007 is on this machine or in git: `.gitignore` ignores `docs/`, and `docs/adr/` does not exist here. Treat ADR-007 as lost; this note replaces it for email.

**Risks the lead must check first**

1. The server's `.env.production` was SMTP-generation config as of 4 Aug (`SMTP_*`, `GOOGLE_APP_PASSWORD`, no `EMAIL_PROVIDER`, no `AWS_SES_*`, no `INTERNAL_SECRET`). `env.ts` hard-fails without `INTERNAL_SECRET`, so `lawie-email-worker` is likely crash-looping under pm2 today. Check `pm2 status` / `pm2 logs lawie-email-worker` before anything else.
2. AC6 is broken in code today: the dry-run branch in `apps/email-worker/src/providers/ses.ts` logs `to`, `cc`, `bcc` and an HTML preview. Fix in this ticket (log template id and user id only).
3. Retries are already there (`packages/email-client`: 5 attempts high tier, 3 otherwise, exponential from 5 s, failed jobs kept 30 days for `scripts/replay.ts`). AC4 is mostly verification, not build.

**Founder to-do (one ask)**

1. Confirm which AWS account owns the EC2 host, and give the lead SES + IAM console access in `ap-south-1` (or do steps 2 and 5 yourself).
2. In SES `ap-south-1`: create domain identity `lawie.in` with Easy DKIM, and set custom MAIL FROM `mail.lawie.in`.
3. At the DNS host for `lawie.in`, add: the 3 DKIM CNAMEs SES shows; for `mail.lawie.in` the MX record and the TXT `v=spf1 include:amazonses.com ~all` SES shows; TXT at `_dmarc.lawie.in` = `v=DMARC1; p=none; rua=mailto:contact@lawie.in` (skip if a DMARC record already exists, tell us what it says). Do not add a second SPF record on the root domain.
4. Request SES production access for `ap-south-1`: transactional only (sign-up, password reset, payment receipts), under 1,000 mails/month, bounces and complaints handled by the SES suppression list. AWS usually answers in about a day.
5. Create IAM user `lawie-ses-sender` (send-only), and put its keys plus `EMAIL_PROVIDER=ses` and a 32-char `INTERNAL_SECRET` into the server's `.env.production`. Never paste the keys into a ticket or chat.
6. Create `contact@lawie.in` as a Google Workspace alias on your mailbox (Reply-To and DMARC reports land there).
