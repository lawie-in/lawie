Status: assigned 28 Oct 2026 (see leads.md)

# T-638: Bail "in custody since" from the arrest date (Ajay R1); police station in prose; Hindi non-answers

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (bail drafts) |
| Owner  | a lead (drafting), after T-612 |
| Mode   | Full chain; legal |
| Status | To do. Split from T-612, 27 Oct 2026. Priya |

## Acceptance criteria
1. R1 (Ajay, T-611 policy): custody_since is derived from the arrest date and shown in the brief. If surrender is mentioned, ask; don't derive. The skeleton line reads "was arrested on {date} and is now in {custody_kind}" (Ajay ruling 5).
2. annexures.service.ts:505, "registered at PS {ps}" in prose, follows Ajay 73e3be57 (bare name; "Police Station X").
3. intake-brief.ts NONE_ANSWERS adds नहीं and कोई नहीं (Ajay to confirm).
4. Tests, with Ajay's byte check.
