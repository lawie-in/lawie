# Production database backup: Ajay's ruling (21 Oct 2026)

Question (Arjun, `handoff/ops/prod-pipeline-and-secrets.md`): for the first production Atlas cluster, which holds client drafts and intake facts, is M0 (no backup), Flex (daily snapshot) or M10 (point-in-time restore) acceptable for a pilot with paying advocates?

| Ref | Point | Ruling |
|---|---|---|
| AJ-DB-1 | M0 (no backup) | **Not acceptable once anyone pays.** DPDP Act 2023 s.8(5) requires reasonable security safeguards to prevent a personal data breach. Under s.2(u), a breach includes accidental loss of personal data, so losing a database with no backup is a breach that must be notified. |
| AJ-DB-2 | Flex (daily snapshot, up to about 24 h lost) | **Acceptable for the pilot.** The law asks for reasonable safeguards, not point-in-time restore. Conditions a–e must all hold before go-live. |
| AJ-DB-2a | Privacy §3 | The live text "We do not currently keep backups of your data." becomes false on Flex and must be replaced in the same release. Signed replacement: `We back up our database once a day and keep each backup in India (Mumbai) for up to 7 days. If our database is lost, work saved since the last backup (up to about one day) may be lost. Download and keep your own copy of every document you need.` |
| AJ-DB-2b | Retention | Snapshot retention must be **7 days or less**, because the policy already promises that "Backup copies are erased within 7 days" (in two places). If Flex cannot be set to 7 days or less, send me the real figure and I will re-sign both erasure lines first. Flex's default retention: verify. |
| AJ-DB-2c | Location | Snapshots stay in ap-south-1 (Mumbai), to match §3. |
| AJ-DB-2d | Restore drill | Run one restore from a snapshot before go-live and record how long it took (this also serves T-403). |
| AJ-DB-2e | Loss event | Any restore that loses user data is treated as a personal data breach. Escalate it to me the same day for intimation to the Board and the affected users. The exact DPDP Rules timelines: verify. |
| AJ-DB-3 | M10 (point-in-time) | Not legally required for the pilot. It becomes required once Lawie promises users restore, uptime or zero data loss, or once Arjun's move-to-M10 triggers are reached. Any longer retention under M10 also needs AJ-DB-2b first. |
| AJ-DB-4 | Version | The §3 change adds no new data, purpose or recipient (Atlas is already listed), so no re-acceptance is needed. "Last updated" moves to the release date. |
