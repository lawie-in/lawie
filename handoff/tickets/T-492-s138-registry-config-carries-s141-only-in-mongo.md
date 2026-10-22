# T-492: The unused legal_notice_s138 registry config carries s.141 only in Mongo

| Field  | Value |
| ------ | ----- |
| Status | To do. V1.1 (Arjun, 16 Oct 2026). Priya |
| Owner  | Lead who is free |
| Mode   | Small fix |

## Source

Kunal, T-477 Explore (16 Oct 2026). Arjun ruled it out of T-477.

## What

The legal_notice_s138 registry config is not used by the promoted path, and it carries the s.141 act only in Mongo. Decide: remove the dead config, or make the file and Mongo agree. Packs are read from disk at boot, so the Mongo mirror is not used.

## Acceptance criteria

- One source of truth for the s.141 act on the s.138 notice; no dead config left.
- Tests; Ajay sees the diff if any act text changes.
