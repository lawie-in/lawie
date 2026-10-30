# T-694: A real test for the T-607 required app settings

Status: backlog (low priority). Raised 29 Oct 2026 by Shashank during T-688. The gap is recorded in .claude/docs/test-gaps.md.

## Acceptance criteria
1. A unit test shows that every required ai.model.* role setting (drafter, extractor and fact_checker, per T-684), plus the legacy fallbacks during the fallback release, raises the boot config warning when missing and is clear when present.
2. The test joins the drafting sanity tier.
