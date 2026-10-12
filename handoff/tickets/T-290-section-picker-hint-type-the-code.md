# T-290 — Section picker: hint to type the code for old-law numbers

| Field          | Value |
| -------------- | ----- |
| Phase          | 4 — Polish and release |
| Owner          | Lead (build, web). Ajay signs the hint words. Rajesh if the look changes. Anushka |
| Mode           | Small fix (web) |
| Status         | To do. Unassigned. Raised by Arjun during T-277 round 4, 12 Oct 2026. After T-277 merges |

Under Arjun's T-277 rule, a bare number with no code (for example "303") is never read as a BNS section. An advocate who types an old IPC number without "IPC" gets nothing matched. The BNS section picker (in `apps/web/src/components/form/DynamicFormRenderer.tsx`, to be confirmed by the lead) should tell them to type the code.

## Acceptance criteria

1. Under the section picker, a short hint says to type the code with old-law numbers (for example "IPC 302"). Exact words: Ajay signs them.
2. No change to how values are stored or read (T-277 owns that).
3. Readable at 375 px; no layout change beyond one line of hint text.

## Gates

- Design: Rajesh only if the look changes
- ADR: Not needed
- Legal sign-off: Ajay (the hint words)
