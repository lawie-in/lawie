# T-382 — Typed enrolment number is ignored in seven packs

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (drafting config) + Ajay (pack JSON is legal content) |
| Mode   | Small fix |
| Status | To do. Unassigned. From T-365 Explore (Mahak, 13 Oct 2026) |
| Source | default_bail, bail_before_magistrate and interim_bail spell `advocate_enrolment`; the code reads `advocate_enrollment` |

## Acceptance criteria

1. A typed enrolment number prints in default_bail, bail_before_magistrate and interim_bail drafts.
2. One spelling everywhere. Either rename the key in the three packs (legal content, Ajay signs) or have the code read both (Arjun's choice). Coordinate with T-374, which moves the bail packs onto skeletons.
3. A test for each of the three packs.

## Ajay (13 Oct 2026)

There are 7 packs, not 3: bail_before_magistrate, bail_cancellation, default_bail, interim_bail, surrender_application, suspension_of_sentence and vakalatnama. Rename the id to `advocate_enrollment`. It's a key-only change with the labels unchanged, and Ajay signs it. preflight.service.ts reads a third spelling, `advocate_enrolment_no` (for Arjun). Arjun decides whether the code also reads the old key for saved drafts.
