# T-659 — Golden set: skip with a notice when the fixture DB is unreachable (push and PR runs)

Status: backlog (unassigned). Arjun ruling, 29 Oct 2026. Small fix. Files: .github/workflows/golden-set.yml and scripts/golden-set/*.

## Problem
The "Golden set — Drafting (real model)" run on 93896c47 failed with exit 4: Atlas rejected the GitHub runner's IP. No model calls were made.

## Acceptance criteria
1. On push and PR runs, if the fixture DB is unreachable, the job ends as skipped with a visible notice annotation, "golden set skipped: fixture DB unreachable". This mirrors the missing-secrets path.
2. On the scheduled nightly run, the same condition stays a FAILURE.
3. No model call is made before the DB check.
4. Tests in scripts/__tests__ cover both run types.

## Separate (founder, not urgent)
The permanent fix needs Atlas access. If the GOLDEN_SET cluster holds only fixtures: a 0.0.0.0/0 entry with a dedicated readWrite user on the golden DB only. If the cluster is shared with develop or prod: a separate free-tier fixture cluster instead. Arjun is asking the founder.

## Ruling (Priya, 30 Oct 2026; Arjun FYI)
workflow_dispatch FAILS red like the nightly. golden-set.yml has no PR trigger, so the skip applies to push only.
