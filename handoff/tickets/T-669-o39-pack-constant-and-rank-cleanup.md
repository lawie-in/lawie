# T-669 — Shared O.39 pack-id constant; rank() in requiredItemBlockers per pack

Status: backlog (unassigned). Follow-ups from Vishal's T-666 report, 29 Oct 2026.

## Acceptance criteria
1. One exported constant lists the O.39 pack ids. Every place that hard-codes them uses the constant instead. There is no behaviour change.
2. rank() in requiredItemBlockers currently orders blockers by O39_REQUIRED_FIELDS in every pack. Ajay decides whether non-O.39 packs keep that order or use the pack's own field order. Implement his call and pin it with a test.
3. Drafting CI is green, and the snapshots are unchanged unless Ajay's call changes the order.

4. Fix the stale comments in form-ledger.ts ~263-273 and documents.routes.ts ~1027-1030 (from T-668).

## Mode
Small fix (drafting only), legal content if the order changes.
