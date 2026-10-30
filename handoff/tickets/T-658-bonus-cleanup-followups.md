# T-658 — Small follow-ups from T-652

Status: backlog (unassigned). From Kunal's T-652 review, 28 Oct 2026.

1. Index the inkledger {reason, createdAt} admin feed query (index in billing).
2. Old signup_bonus rows show as "redeemed referral" in the admin feed. They age out of the 7-day window; fix the label or leave them to expire.
3. A clear-down script for legacy earnedCredits. Dry run by default, run only through Arjun and Nikhil, under the retention rules (Ajay M9b).
4. Release note: POST /credits/rate/:docId now returns 404.
