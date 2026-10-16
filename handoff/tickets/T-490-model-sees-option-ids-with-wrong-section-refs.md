# T-490: The model sees option ids that carry wrong or unverified section references (T-473 follow-ups F1-F3)

| Field  | Value |
| ------ | ----- |
| Status | To do. Post-v1 unless Ajay says it blocks (Ajay, f1a18422, 16 Oct 2026). Priya |
| Owner  | Lead who is free after T-473 merges; Ajay re-signs |
| Mode   | Full chain (legal content) |

## Source

Ajay, T-473 label sign-off (ref f1a18422, 16 Oct 2026). T-473 itself is signed and ships. Details are in Ajay's file.

## What

- F1: the drafting model is shown option ids, and some ids carry wrong or unverified section references. Either give those options aliases, or send the model the label instead of the id. Needs Ajay's re-sign.
- F2: the ITAT s.264 option. Tied to T-456.
- F3: three question labels: TDS thresholds, S.117 Mohammedan law, POSH 2(n).

## Acceptance criteria

- No id with a wrong or unverified section reference reaches the model; stored answers still read (read-time alias, `// T-490 alias, remove in the post-v1 cleanup`).
- F2 and F3 follow Ajay's text byte for byte.
- Tests; Ajay's ref.
