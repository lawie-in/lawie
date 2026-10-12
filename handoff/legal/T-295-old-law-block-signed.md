# T-295: old-law line in pre-flight (signed, 12 Oct 2026 IST)

Ajay (CLO). Replaces the `section_whitelist` question for an IPC / CrPC / IEA entry in `sections_charged` (`preflight.service.ts`, the `legacySectionParts` loop), which today reads "BNS Section 302 IPC is not in the First Schedule…". Apply the block byte for byte.

```text
{Code} {n} is an old-law section. For an offence committed on or after 1 July 2024, use the section converter to find the {NewCode} section. For an earlier offence, the old section may still apply.
```

SHA-256 of the block between the fences, final newline included: `ae7b7e4e8b713f6acf660424f986cce5798b76d4e265ebfd2886422cb54a6535`

| Placeholder | Value |
|---|---|
| `{Code}` | `IPC`, `CrPC` or `IEA`, always this casing |
| `{n}` | the section number with any sub-section, as typed, without the code. Code goes first whatever the input order: "302 IPC", "420-IPC" and "IPC 302" all show as `IPC 302` / `IPC 420` |
| `{NewCode}` | `BNS` for IPC, `BNSS` for CrPC, `BSA` for IEA |

Rules
1. Never put "BNS" in front of an old-law number. One code per section in any line.
2. Test pins the line for `302 IPC`, `420-IPC`, `CrPC 438` and `IEA 65B`. Send me the diff.

Not signed here, recommendation only (Priya / Arjun decide): the line is a hard block today. An FIR for an offence committed before 1 July 2024 is still charged under IPC, so a hard block stops a correct draft. I recommend `soft`. The wording above works for either.
