# T-503: Save the limitation-flag count on the generation record and the done event

| Field  | Value |
| ------ | ----- |
| Status | To do. V1.1 (Priya, 16 Oct 2026), from T-472 (d) |
| Owner  | Lead who is free |
| Mode   | Small fix |

## Source

Mahak, T-472 (d): Arjun's spec asks for the limitation-warning count on the run metadata. T-472 returns `limitationFlags` on the result object (both paths) but saving it on the Generation record and the SSE done event needs changes in routes/documents.routes.ts and models/Generation.model.ts, outside her claim.

## What

Add an optional `limitationFlags` number to the Generation record (next to `ledger` and `onlyWhenStrips`) and the done payload, recorded in recordGeneration. Counts only, no text. Same additive style as T-480 and T-477.

## Acceptance criteria

- Each criminal revision draft records how many limitation sentences the model wrote and the checks flagged.
- Test for the field; no behaviour change.
