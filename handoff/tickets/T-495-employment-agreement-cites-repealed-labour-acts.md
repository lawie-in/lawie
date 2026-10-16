# T-495: employment_agreement still cites the Industrial Disputes Act 1947 and the Standing Orders Act 1946

| Field  | Value |
| ------ | ----- |
| Status | To do. V1.1 (Ajay, 16 Oct 2026). Priya |
| Owner  | Lead who is free; Ajay verifies and signs |
| Mode   | Full chain (legal content path) |

## Source

Ajay, T-477 byte check (16 Oct 2026, ref 8766fbf1).

## What

The employment_agreement pack still cites the Industrial Disputes Act, 1947 and the Industrial Employment (Standing Orders) Act, 1946. Ajay verifies both against the Industrial Relations Code, 2020 and gives the correct act names and sections. Then update the pack's acts (and any other pack that cites them).

## Acceptance criteria

- The pack cites what Ajay signs; no repealed act remains without his ruling.
- Check the other packs for the same two acts (search before building).
- Tests; Ajay's ref; Ajay sees the diff.
