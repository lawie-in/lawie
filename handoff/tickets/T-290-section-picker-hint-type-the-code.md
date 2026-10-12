# T-290 — Section picker: hint to type the code for old-law numbers

| Field          | Value |
| -------------- | ----- |
| Phase          | 4 — Polish and release |
| Owner          | Lead (build, web). Rajesh words the hint, Ajay signs it. Anushka |
| Mode           | Small fix (web) |
| Status         | To do. Unassigned. Raised by Arjun during T-277 round 4, 12 Oct 2026. Nothing blocks it; build any time (web only) |

Under Arjun's corrected T-277 rule, a bare number with no code (for example "303") is read as BNS, because the picker stores bare numbers. An advocate who types an old IPC number without "IPC" gets the wrong section. The BNS section picker ("Sections Charged" in `apps/web/src/components/form/DynamicFormRenderer.tsx`) should tell them to type the code.

## Acceptance criteria

1. Under the section picker, a short hint says to type the code with old-law numbers (Arjun's draft: "type the code for old-law numbers, e.g. 302 IPC"). Rajesh words it; Ajay signs it.
2. No change to how values are stored or read (T-277 owns that).
3. Readable at 375 px; no layout change beyond one line of hint text.

## Gates

- Design: Rajesh only if the look changes
- ADR: Not needed
- Legal sign-off: Ajay (the hint words)

## Ajay signed the words (12 Oct 2026, board comment T-290 / c_t290_ajay_words)

- Hint under the picker: "Type the Act with each section, for example BNS 303(2) or IPC 379."
- Message when a bare number is entered: "Add the Act before the section number, for example BNS 303(2) or IPC 379."
- An optional Hindi line is in the comment.

Use these words exactly. Rajesh is needed only if the layout changes.
