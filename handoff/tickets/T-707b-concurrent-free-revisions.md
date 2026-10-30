# T-707b: Two simultaneous first revisions can both be free

Status: open, P1, drafting. MUST be fixed before feature.revisions is switched on in prod. Raised 30 Oct 2026 by Priya from Arjun's T-707 audit (H3). Arjun is asking the founder whether to fix it now as v1.3.2 or keep revisions dark until next month.

Two concurrent first-revision requests on the same draft can both be treated as the free revision.

## Acceptance criteria
1. Claiming the free revision is atomic; exactly one concurrent request gets it, and the other is quoted and charged (or refused if Ink is short).
2. A concurrency test.

Also from the audit, P3 (next month): H2, clamp the bucket arithmetic; H4, add a NaN guard on Ink amounts.
