# T-456: itat_appeal: Income-tax Act 2025 section numbers

| Field  | Value |
| ------ | ----- |
| Status | Todo. Ajay maps the sections first; no lead yet. Priya, 15 Oct 2026 |
| Owner  | Ajay (mapping and sign-off), lead to be assigned (build) |
| Mode   | Full chain (legal content under apps/drafting/src/config/document-rules/) |

## Source

Ajay, 15 Oct 2026, during T-449: the Income-tax Act, 2025 applies from 1 April 2026, so the 1961-Act section numbers in `itat_appeal` need checking.

## Scope

The `itat_appeal` pack (apps/drafting/src/config/document-rules/itat_appeal.json and any template twin). Ajay marks the pack "verify" until he has mapped the sections. Other income-tax packs: Ajay says in the mapping whether any are affected.

## Acceptance criteria

1. Ajay delivers a section map (1961 Act to 2025 Act) for every section the pack cites, with the date each applies from.
2. Every section reference in model-visible text follows the map, byte for byte from Ajay's text. No new law added by the lead.
3. Tests and goldens updated only where the old numbers were pinned; Ajay signs any golden change.

## Not in V1 unless Ajay says it is launch-critical

Priya to confirm with Ajay whether `itat_appeal` is in the launch catalogue (T-245b list).
