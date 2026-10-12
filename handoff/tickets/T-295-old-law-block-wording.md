# T-295 — Old-law block reads "BNS Section 302 IPC"

| Field  | Value |
| ------ | ----- |
| Phase  | 1 — Legal accuracy |
| Owner  | Ajay (writes and signs the wording). Lead (build) |
| Mode   | Small fix, legal content |
| Status | To do. Wording signed (455559c). Soft warning decided; Arjun to confirm mechanism. Then any free lead |

The old-law block in the drafting prompt can read "BNS Section 302 IPC…", which mixes the two codes. Ajay writes the correct wording; a lead applies it.

## Acceptance criteria

1. Ajay's signed wording replaces the mixed line, exactly.
2. A test pins the new wording. Ajay signs the diff as applied; moved snapshots go to him.

## Ajay signed the wording (12 Oct 2026)

`handoff/legal/T-295-old-law-block-signed.md` (455559c, block SHA in that file). The line never puts "BNS" in front of an old-law number.

## Decision: soft, not a hard block (Priya, 12 Oct 2026, on Ajay's advice)

Offences committed before 1 July 2024 are still charged under IPC, so a hard block stops correct drafts. The old-law line becomes a warning the advocate can proceed past; the draft is not stopped. Arjun confirms the mechanism (or objects) in this ticket before the build starts. Ties in with T-245 (old/new law switch).

## Acceptance criteria (added)

3. An IPC section for an offence before 1 July 2024 shows the signed line as a warning and the draft continues.
