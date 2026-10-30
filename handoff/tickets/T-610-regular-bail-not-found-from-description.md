# T-610: Regular bail cannot be started by describing the matter

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (severity P1; from the prod quality check of 26 Oct 2026) |
| Owner  | Vishal or Shashank (drafting); Ajay checks routing |
| Mode   | Full chain |
| Status | Building (Shashank), 26 Oct 2026 (stop lifted). Priya |
| Source | handoff/quality/2026-10-26-prod-drafting-FAIL.md |

## Problem
Describing a regular bail matter (657 chars, or one line) answers 'We could not find a ready document for this', three tries. Regular bail is the main document and works only from Templates. Anticipatory bail, s.138 and Order 39 are recognised from a description. Quality report item 1.

## Acceptance criteria
1. A regular bail description (the 657-character matter and a one-line version) is recognised as bail_regular and reaches the brief.
2. No Ink is taken on a 'not found'.
3. Find why it is not matched (alias, classifier threshold, the T-585/T-577 changes?) and pin it with a test using both inputs.

## Files
Lead lists after Explore (web/drafting intake (classifier)). Claimed by Priya.

## Phase 0 design (Arjun, 26 Oct 2026; handoff/design/ADR-drafting-v3.md sections 3B and 7)
4. Code alias/keyword pass first (add match terms for bail_regular; distinguish the five bail packs: regular, anticipatory, before magistrate, interim, default).
5. Then one cheap classify returning the top 3 templates with confidence. Below the threshold (start 0.75; tuned later on logged intakes, ids/outcomes only) the user picks from the 3 on screen. Never "not found" when the catalogue has a plausible match. No Ink on a not-found or a pick screen.
6. Make the match output robust: no no_match from a truncated or malformed answer (the 300-token cap) or an off-list id; on such a failure, retry once or fall back to the top-3 pick.
7. The pick screen is new UI: Rajesh gives one line before it ships.
8. Tests: Anushka's 657-character matter and a one-line "regular bail" description both reach bail_regular (or a top-3 with it first).
