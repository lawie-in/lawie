# T-324 — No old-law warning for an IPC alias on a BNS entry

| Field  | Value |
| ------ | ----- |
| Phase  | 1 — Legal accuracy |
| Owner  | Arjun (spec: last section of the T-295 file, 6178529). Ajay confirms. Lead (build, drafting) |
| Mode   | Small fix (legal content) |
| Status | To do. Waits on Ajay's confirm. Shashank after T-295. From the T-295 review, 12 Oct 2026 |

An entry like "BNS 303 (IPC 379)" gets the T-295 soft old-law warning even though the charge is under BNS. Skipping it narrows when Ajay's signed line shows.

## Acceptance criteria

1. An IPC alias attached to a BNS entry does not trigger the old-law warning, per Arjun's spec in T-295.
2. A bare IPC entry still gets the warning.
3. Tests cover both cases. Ajay confirms before the build and sees the diff.
