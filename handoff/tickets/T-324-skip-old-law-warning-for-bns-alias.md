# T-324 — No old-law warning for an IPC alias on a BNS entry

| Field  | Value |
| ------ | ----- |
| Phase  | 1 — Legal accuracy |
| Owner  | Arjun (spec: last section of the T-295 file, 6178529). Ajay confirms. Lead (build, drafting) |
| Mode   | Small fix (legal content) |
| Status | Merged into develop_staging (cf26a25, 12 Oct 2026). Waiting for Anushka on develop |

An entry like "BNS 303 (IPC 379)" gets the T-295 soft old-law warning even though the charge is under BNS. Skipping it narrows when Ajay's signed line shows.

## Acceptance criteria

1. An IPC alias attached to a BNS entry skips the old-law warning only when the signed T-267 table maps that IPC section to that BNS section, e.g. "BNS 303 (IPC 379)" (Ajay).
1a. A mismatched pair, e.g. "BNS 303 (IPC 302)", keeps the warning.
2. A bare IPC entry still gets the warning.
3. Tests cover one matching pair, one mismatched pair and a bare IPC entry. Ajay confirms before the build and sees the diff.
