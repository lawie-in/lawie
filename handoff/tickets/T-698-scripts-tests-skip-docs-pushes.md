# T-698: Scripts tests should not be cancelled by docs-only pushes

Status: backlog (small, CI). Raised 30 Oct 2026 by Priya from Vishal's report.

Every Scripts tests run on develop_staging from 180c02e2 on (runs 780 and 786-791) was cancelled by the next push of handoff/docs files (one concurrency group), so the code merge went unverified until run 792.

## Acceptance criteria
1. scripts-tests.yml does not start, or does not cancel the running run, for pushes that only touch handoff/**, .claude/docs/**, docs/** or *.md.
2. A push that changes code still cancels an older run of the same group.
3. Keep the T-663 rule (scripts paths stay listed). Add a test in scripts/__tests__ if the workflow is tested there.
