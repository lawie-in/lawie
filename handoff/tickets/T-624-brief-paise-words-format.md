# T-624: The brief writes paise amounts in the signed "Rupees … and … Paise only" form

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (legal wording) |
| Owner  | whoever holds apps/drafting/src/services/intake-text.ts (Ajay) |
| Mode   | Small fix; legal content (Ajay signed P-R3, ceee45cb) |
| Status | To do. Raised 26 Oct 2026 from Ajay's T-611 build rulings. Priya |

## Problem
T-611 computes the amount in words for drafts using the signed form. The brief's own paise formatter in intake-text.ts still uses the old form.

## Acceptance criteria
1. The brief shows amounts with paise as "Rupees <words> and <words> Paise only" (Ajay P-R3, ceee45cb), byte for byte.
2. Whole-rupee amounts are unchanged.
3. Tests cover 0 paise, 1 paise, 50 paise and the lakh/crore boundaries.
4. Ajay byte-checks it at READY.
