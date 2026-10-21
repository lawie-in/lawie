# T-532: Privacy §3 backup text, if production runs on Atlas Flex

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Ajay (text, AJ-DB-2a), Arjun (cluster choice), a web lead (build) |
| Mode   | Small fix (web, legal content) |
| Status | To do. Ships in the SAME release as the Flex production cluster; not before. Priya |
| Source | `handoff/legal/AJ-prod-db-backup-ruling.md` (21 Oct 2026) |

## Acceptance criteria
1. In `apps/web/src/app/(marketing)/privacy/page.tsx` §3, "We do not currently keep backups of your data." is replaced by Ajay's signed line, exactly: "We back up our database once a day and keep each backup in India (Mumbai) for up to 7 days. If our database is lost, work saved since the last backup (up to about one day) may be lost. Download and keep your own copy of every document you need."
2. `PRIVACY_LAST_UPDATED` moves to the release date. `CURRENT_PRIVACY_VERSION` is NOT bumped (AJ-DB-4: no new data, purpose or recipient).
3. Release conditions (Arjun, not the web lead): snapshot retention 7 days or less (else Ajay re-signs both erasure lines first), snapshots in ap-south-1, one restore drill recorded before go-live, loss events escalated to Ajay the same day.
4. Byte check by Ajay before merge.

## Files
apps/web: app/(marketing)/privacy/page.tsx (§3 and the date only), its tests.
