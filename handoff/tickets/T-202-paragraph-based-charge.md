# T-202 — Charge by paragraphs: 50 drops + 2 per paragraph

| Field      | Value                                                  |
| ---------- | ------------------------------------------------------ |
| Phase      | 2 — Drops pricing                                      |
| Owner      | Vishal                                                 |
| Mode       | Full chain                                             |
| Status     | Blocked: T-201 and T-003 done. Go-live waits for T-004 |
| Depends on | T-201, T-004                                           |
| Branch     | feature/t-202-paragraph-charge                         |
| Created    | 2026-10-03                                             |

## Goal

A draft costs 50 drops plus 2 drops per paragraph, with an estimate shown first.

## Context

- Founder confirmed the formula on 3 Oct 2026. This reverses the June decision that rejected per-paragraph pricing.
- Today the cost is per template: `TEMPLATE_COST` in `apps/drafting/src/services/credits.service.ts` charges 2 credits for bail and consumer complaint, 1 for everything else.
- Spending happens after a successful generation (`enforceCredits` blocks first, the route deducts afterwards). A failed stream is not charged.
- Examples: 10 paragraphs = 70 drops, 25 = 100 drops (1 Ink), 50 = 150 drops.
- Guided drafts (T-106) may get a higher base. T-108 proposes and measures it.
- T-206 is delivered. The limits are in `handoff/design/T-206-paragraph-limits.json`. A paragraph is one numbered paragraph of the body, and all AI-written sections are counted, not only the first.
- Most templates top out at 12 to 18 paragraphs, so most drafts will cost 70 to 90 drops.

## Acceptance criteria

- The charge in drops is 50 + 2 × paragraphs.
- An estimate endpoint returns the drops for a chosen paragraph count before generation.
- After generation the charge uses the actual paragraph count and is never more than the estimate shown.
- Revision is handled in T-205 and review by agent in T-111. Neither endpoint exists today.
- Each document type has a default and a minimum paragraph count. A request below the minimum is raised to the minimum.
- `TEMPLATE_COST` is removed.
- A failed generation charges nothing.
- Too little balance returns the existing 402 response with figures in drops.
- Tests cover: 10, 25 and 50 paragraphs, the estimate cap, the minimum, and a failed generation.
- The paragraph count is taken at generation time, before the content is encrypted, and stored on the `Generation` row.

## In scope

- `apps/drafting/src/services/credits.service.ts`
- `apps/drafting/src/middleware/enforceCredits.ts`
- `apps/drafting/src/routes/documents.routes.ts`
- Per-document default and minimum paragraph counts

## Out of scope

- Web screens (T-203)
- Pricing copy (T-204)

## References

- Design: Not needed
- ADR: Not needed
- Legal sign-off: Ajay, T-206, 4 Oct 2026: the paragraph definition and the target-length rule are signed. The limits for 86 templates are signed after the T-004 check

## Open questions

- What counts as a paragraph? Proposed: non-empty text blocks in AI-generated sections, not counting headings, cause title, prayer or verification. Ajay and Priya to confirm.
- Defaults, minimums and the paragraph definition come from T-206.
- Is the model told a target paragraph count? If yes, that is a prompt change.

## Review, 3 Oct 2026

| Reviewer | Verdict                   | Note                                                                                                                       |
| -------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Arjun    | Approved with changes     | Feasible. Regeneration moved to T-205 because no regenerate endpoint exists. Paragraphs must be counted before encryption. |
| Vikram   | Approved with a condition | The formula goes live only after T-004.                                                                                    |
| Ajay     | Conditional               | Minimums are legal content. They come from T-206 with my sign-off.                                                         |
