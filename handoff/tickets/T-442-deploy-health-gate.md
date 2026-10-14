# T-442: deploys fail loudly when a service is unhealthy; one deploy path

| Field  | Value                                                                  |
| ------ | ---------------------------------------------------------------------- |
| Status | Todo. Mahak, after T-424. V1 go-live prerequisite. Priya, 14 Oct 2026  |
| Owner  | Mahak (build), Arjun (design)                                          |
| Mode   | Small fix (root config / deploy scripts; CI-file claim)                |

Source: Arjun, 14 Oct 2026, from Kunal's finding on T-436 AC10. Production runs on pm2 through `deploy.sh` (`ecosystem.config.js` lists all six services, email-worker and web included). `docker-compose.prod.yml` is a second, incomplete path (no web, no email-worker) and `deploy-production.yml` does nothing. Nothing checks any `/health` after a deploy, so the email worker going from held (503) to live (200) shows in no deploy log.

## Acceptance criteria

1. In `deploy.sh`, after `pm2 reload`, curl `/health` on all six services with a short retry. Exit non-zero if any fails. The email worker must return 200: a 503 (held) fails the deploy loudly.
2. One deploy path only. Delete `docker-compose.prod.yml` and the ECR references, or mark both clearly as unused.
3. Correct the root README's "Production (ECR images)" line to match.
4. Keep the manual `curl /health` step on T-403 as the human double-check.

## Out of scope

Uptime monitoring setup (separate), and any change to `ci.yml`.

Quality: nothing to test in the UI: deploy script only.
