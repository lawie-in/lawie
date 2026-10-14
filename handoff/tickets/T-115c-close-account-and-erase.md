# T-115c — Close an account and erase its data

| Field          | Value |
| -------------- | ----- |
| Phase          | 4 — Polish and release |
| Owner          | Lead (build). Arjun designed it |
| Mode           | Build (auth + services + web) |
| Status         | To do. Unassigned. Waits for Rajesh's design and Ajay's text. After T-115a |
| Parent         | T-115 |

Account close (blocked while a subscription is active) goes through `/internal/erase-user`: auth orchestrates, each service erases its own data; `scripts/erase-user.ts` uses the same path. Per Arjun's revised design in `T-115-permanent-delete-and-encrypted-inputs.md`. Billing rows: Ajay decides whether they stay.

## Acceptance criteria

See the slice list and acceptance criteria in `T-115-permanent-delete-and-encrypted-inputs.md` (Arjun, 12 Oct 2026, revised design). Gate before v1 go-live.

## Note (Priya, 12 Oct 2026)

Ajay condition 5 on T-242: deleting an account must remove the whole User document, including `signupSource` (UTM tags and time). No delete path exists today.

## Arjun (14 Oct, 18:25 UTC) — backup retention, for Ajay's policy line

- Today: production Mongo is Atlas M0, which has **no backups**. A deleted document or a closed account is gone the moment the erase runs; nothing holds a copy. Redis holds no case details beyond the encrypted `intake:cache:*` entries, which expire in 30 minutes.
- When the founder turns on Atlas Cloud Backup (on his reminder list, needs M10+): the policy I will set is daily snapshots kept **7 days**, no weekly or monthly snapshots. So the policy line can safely say deleted data may remain in backups for **up to 7 days**, and that line stays true for M0 (0 days) as well.
- Failed email jobs: kept up to 30 days (T-220), already in Ajay's text.

| Status | Todo. Tanvi, after T-425. Spec handoff/marketing/close-account-spec-t115c.md; Ajay text a84e298. Priya, 14 Oct 2026 |
