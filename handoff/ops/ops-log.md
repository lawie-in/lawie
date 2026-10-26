# Ops log — every prod / develop-box action (Nikhil, `nikhil.md` §6)

| date (UTC) | box | action | who asked | result |
|---|---|---|---|---|
| 2026-10-26 09:58 | lawie-prod | `lawie-prod-ops action=health` (first SSM check; IAM user `lawie-arjun-ops`) | arjun session (Task 1), founder go in chat | Success: 4000/4001/4002/4003/9100 → 200; 3000 → 404 (web has no `/health` route; pm2 shows lawie-web online) |
| 2026-10-26 09:58 | lawie-prod | `lawie-prod-ops action=status` | arjun session (Task 1), founder go in chat | Success: all 6 lawie-* online; billing ↺1 (7h uptime), others ↺0 (10h) |
| 2026-10-26 09:58 | lawie-prod | `lawie-prod-ops action=disk` | arjun session (Task 1), founder go in chat | Success: / 52% used (9.9G/20G); RAM 846M used of 3836M; swap 0 used |
| 2026-10-26 11:26 | lawie-prod | `lawie-prod-ops action=health/status/disk` (restart session; `sts` = `lawie-arjun-ops`, 3 AWS vars set) | arjun session (Task 1) | **Not sent**: SSM send-command blocked by this session's permission classifier; nothing ran on the box |
| 2026-10-26 11:30 | lawie-prod | `lawie-prod-ops action=health` (`--region ap-south-1` needed: CLI ignores `AWS_REGION` here) | arjun session (Task 1), founder go in chat | Success: 4000/4001/4002/4003/9100 → 200; 3000 → 404 (no `/health` on web; pm2 lawie-web online) |
| 2026-10-26 11:30 | lawie-prod | `lawie-prod-ops action=status` | arjun session (Task 1), founder go in chat | Success: all 6 lawie-* online; billing ↺1 (9h), others ↺0 (11h); host ram 29.8% |
| 2026-10-26 11:30 | lawie-prod | `lawie-prod-ops action=disk` | arjun session (Task 1), founder go in chat | Success: / 52% (9.9G/20G); RAM 826M used of 3836M; swap 0 used |
| 2026-10-26 11:31 | develop (i-07925b68d6dd907c4) | `lawie-prod-ops action=health` (first SSM check on this box) | arjun session (Task 2), founder go in chat | Success: 4000/4001/4002/4003/9100 → 200; 3000 → 404 (no `/health` on web) |
| 2026-10-26 11:31 | develop (i-07925b68d6dd907c4) | `lawie-prod-ops action=status` | arjun session (Task 2), founder go in chat | Success: all 6 lawie-* online, ↺0, uptime 17m (recent reboot) |
| 2026-10-26 11:31 | develop (i-07925b68d6dd907c4) | `lawie-prod-ops action=disk` | arjun session (Task 2), founder go in chat | Success: / 76% (14G/19G, 4.6G free); RAM 671M used of 909M (238M available); swap 37M of 2047M |
| 2026-10-26 12:09 | develop (i-07925b68d6dd907c4, t3.small, IP 16.4.115.0) | `lawie-prod-ops action=health` (after founder's resize + DNS update) | arjun session (dev-box-move), founder | **Degraded**: 4000/9100 → 200; 4001/4002/4003 → 000 (no response); 3000 → 404 |
| 2026-10-26 12:09 | develop | `lawie-prod-ops action=status` | arjun session (dev-box-move), founder | auth/billing/drafting **crash-looping** (↺80 each, uptime seconds); gateway/web/email-worker online ↺0 (8m) |
| 2026-10-26 12:09 | develop | `lawie-prod-ops action=nginx-test` | arjun session (dev-box-move), founder | Success: syntax ok (still old server_names/cert per founder) |
| 2026-10-26 12:09 | develop | `lawie-prod-ops action=logs service=lawie-auth lines=30` | Nikhil (incident triage) | Cause: `MongoServerSelectionError getaddrinfo ENOTFOUND` on the develop Atlas cluster's shard hostname → Mongo services can't boot. Redis connected. Founder to check Atlas cluster state + box DNS + access list for the new IP |
