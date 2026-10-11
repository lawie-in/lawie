# T-247 — Server log rotation and retention; email-worker stops logging recipients

| Field          | Value |
| -------------- | ----- |
| Phase          | 4 — Polish and release |
| Owner          | Arjun (retention period). Lead (build). Founder (applies it on the EC2 host) |
| Mode           | Small fix |
| Status         | To do. Unassigned. Ajay's T-235 follow-up, 12 Oct 2026 |

## Acceptance criteria

1. Log rotation is configured for the pm2 logs (e.g. pm2-logrotate settings in `ecosystem.config.js`, or a documented install step), with the retention period Arjun sets.
2. The email-worker no longer logs recipient addresses (`send.ts:50,56`, `ses.ts:57`). Mask them, or log a hash. If T-229 does this first, this item is already met.
3. The deploy notes say how the founder applies it on the host.
