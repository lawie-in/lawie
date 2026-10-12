# T-290 — Section picker: hint to type the code for old-law numbers

| Field          | Value |
| -------------- | ----- |
| Phase          | 4 — Polish and release |
| Owner          | Rajesh (words, small layout). Ajay signs. Lead (build, web). Anushka |
| Mode           | Small fix (web) |
| Status         | Waiting for Rajesh's words and layout, then Ajay's sign-off. Builds after T-277 (needs the signed titles) |

Under Arjun's corrected T-277 rule, a bare number with no code (for example "303") is read as BNS, because the picker stores bare numbers. An advocate who types an old IPC number without "IPC" gets the wrong section. The BNS section picker ("Sections Charged" in `apps/web/src/components/form/DynamicFormRenderer.tsx`) should tell them to type the code.

## Acceptance criteria

1. Under the section picker, a short hint says to type the code with old-law numbers (Arjun's draft: "type the code for old-law numbers, e.g. 302 IPC"). Rajesh words it; Ajay signs it.
2. No change to how values are stored or read (T-277 owns that).
3. Readable at 375 px; no layout change beyond one line of hint text.

## Gates

- Design: Rajesh only if the look changes
- ADR: Not needed
- Legal sign-off: Ajay (the hint words)

## WITHDRAWN by Ajay, 12 Oct 2026 (superseded below). Earlier words (12 Oct 2026, board comment T-290 / c_t290_ajay_words)

- Hint under the picker: "Type the Act with each section, for example BNS 303(2) or IPC 379."
- Message when a bare number is entered: "Add the Act before the section number, for example BNS 303(2) or IPC 379."
- An optional Hindi line is in the comment.



## Ajay's two conditions (12 Oct 2026, replaces the withdrawn lines)

The risk: an advocate types "302" meaning IPC 302 and gets BNS 302, a different offence.

1. The hint must say: "A number without the Act is read as a BNS section."
2. The picker must show what it read before the draft uses it, for example "Read as BNS 302: {title}" (title from the signed BNS table, so this builds after T-277).

Rajesh writes the words and the small layout; Ajay signs them against these two points. Then any free lead builds it.

## Rajesh (12 Oct 2026): design in handoff/design/T-290-section-picker-hint.md (f478f6b)

- Hint: "A number without the Act is read as a BNS section. For IPC, type the Act, for example IPC 302."
- Read-as line: "Read as BNS {number}: {title}"; unknown title: "Read as BNS {number}" (no guess).
- Layout: each value in its own block, chip with its read-as line under it, stacked. Hint colour slate-500 (contrast).
- Also in scope: the chip remove "x" gets a 44 px tap target. Titles come only from the signed T-277 table.
- Waiting for Ajay to sign the strings, including S5 ("Read as a section of another Act (not checked)").
