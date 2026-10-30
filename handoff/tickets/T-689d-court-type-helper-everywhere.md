# T-689d: One court-type helper for every annexure

Status: FOLDED INTO T-700 (30 Oct 2026). Was: backlog (legal; Ajay ruled in AJ-689c-BC 4e83cf4e). Raised 30 Oct 2026 by Priya from Kunal's T-689c follow-ups.

1. The court-fee annexure takes its court type from formData.court_type ?? rules.courtType. That order differs from Annexure B's, so a High Court document with no form court_type could get the Synopsis together with district-court fee text. Use the same court-type helper as Annexure B.
2. Once a court is chosen, its lookup type wins over a stored doc.courtType, so a stale stored type can't put a Synopsis on a trial-court pack.
3. Small: the comment in AnnexuresCard.tsx still says "7 annexures".

## Acceptance criteria
- Annexure B and the court fee always agree on the court type.
- Tests: an HC document with no form court_type; a stale doc.courtType with a trial court chosen.
- Ajay byte-checks the final SHA (legal content, plus golden snapshots if they change).
