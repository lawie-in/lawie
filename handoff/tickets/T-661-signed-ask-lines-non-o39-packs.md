# T-661 — Signed ask lines for the party fields in non-O.39 packs (plaint_partition, replication, written_statement)

Status: backlog. Goes next after T-655 merges. A follow-up to T-650, 29 Oct 2026. Legal content: Ajay byte-checks.

## Problem
On the brief route, an unanswered plaint_partition `other_defendants` (blocks_confirm: true) blocks Confirm with NO message (confirm_message is null). The form route says "<label> is required". The signed ask line needs the M1 code path: o39-confirm-messages.ts, form-ledger and intake-brief confirmState.

## Acceptance criteria
1. The brief route shows Ajay's signed line T-650 (3g), byte for byte, when other_defendants is unanswered. Do the same for the party-name fields in replication and written_statement if Ajay signed lines for them; otherwise keep the generic T-127 line.
2. Remove the interim exception for plaint_partition#other_defendants in t629-confirm-block.test.ts, so the pin is strict again.
3. One copy of each message list (FR-5a).
4. Ajay byte-checks before merge, and any signed doc rides in the same branch.
