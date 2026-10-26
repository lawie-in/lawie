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
