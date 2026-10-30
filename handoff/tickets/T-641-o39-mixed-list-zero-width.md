# T-641: Non-answers in mixed lists and zero-width values (Ajay E1/E2)

| Field  | Value |
| ------ | ----- |
| Phase  | 5 — Polish (legal) |
| Owner  | a lead (drafting), next week |
| Mode   | Small fix; legal |
| Status | To do. Raised 27 Oct 2026 (Ajay, T-613 file E1/E2, 23e2f263). Not blocking. Priya |

## Acceptance criteria
1. Mixed lists drop non-answer entries; ["Declaration","N/A"] becomes ["Declaration"].
2. A value made only of zero-width or whitespace characters counts as empty, so it blocks Confirm.
3. Tests; Ajay byte-checks at READY.
