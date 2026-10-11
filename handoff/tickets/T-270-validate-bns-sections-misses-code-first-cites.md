# T-270 — validateBnsSections misses code-first citations like "BSA 85" and "BNS 103"

| Field          | Value |
| -------------- | ----- |
| Phase          | 1 — Describe and draft |
| Owner          | Ajay (rule, signs). Lead (build). Anushka (verdict) |
| Mode           | Rule first, then build. Legal content (`ai.service.ts`) |
| Status         | To do. Unassigned. After T-200 (same file). Found by shashank, 12 Oct 2026 |

## Problem

`validateBnsSections` in `ai.service.ts` only reads citations written as "Section N", "Sec. N" or "u/s N". A code-first citation such as "BSA 85" or "BNS 103" isn't checked, so a wrong section can pass.

## Acceptance criteria

1. Ajay rules which forms the validator must read: code-first, "S.", "Ss.", ranges, and sub-section forms.
2. The validator checks each against the signed section tables.
3. Tests for each form, including a wrong number that must be flagged.
4. Golden snapshots that move are listed for Ajay. CI green on drafting.

## Detail (shashank, with Ajay's agreement, 12 Oct 2026)

Priority: medium. The check should also read `<ACT> <number>` and `<number> <ACT>` for BNS, BNSS, BSA, IPC, CrPC and IEA, for example "BSA 85" and "103 BNS".
