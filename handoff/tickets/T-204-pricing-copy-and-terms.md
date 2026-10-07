# T-204 — Pricing copy and terms for drops

| Field      | Value                                         |
| ---------- | --------------------------------------------- |
| Phase      | 2 — Drops pricing                             |
| Owner      | Madhuri (copy), Ajay (terms), Meera approves  |
| Mode       | Copy and legal first, then a small web change |
| Status     | Blocked: T-004 and T-108 sign-off             |
| Depends on | T-004, T-108, T-107                           |
| Branch     | feature/t-204-pricing-copy                    |
| Created    | 2026-10-03                                    |

## Goal

Every public and in-app mention of pricing explains drops correctly.

## Context

- Public pages are under `apps/web/src/app/(marketing)/`: `pricing`, `terms`, `refunds`, `faq`.
- The pricing model on record says "1 Ink = 1 document". That is no longer true.
- Kavya's Logbook notes that Legal & Policy Pack v1.0 still describes the old 799-rupee unlimited plan.

## Acceptance criteria

- The pricing page explains drops in one line and shows three worked examples (10, 25 and 50 paragraphs).
- Plan and top-up tables show drops.
- No page or in-app string still says "1 Ink = 1 document".
- Terms and refund policy describe drops, the estimate, and the "never more than the estimate" rule.
- The Legal & Policy Pack in Notion is updated to the current plans.
- Ajay's sign-off reference is added to this file.
- The price of a review by agent and of a revision, once T-108 fixes them.
- The label and the terms for drafts made without a template (Ajay, T-107).
- The privacy and terms text from T-302 (sections 6 and 7) and the guided-draft terms from T-107 (section 8).

## In scope

- `apps/web/src/app/(marketing)/pricing`, `terms`, `refunds`, `faq`
- In-app strings in `apps/web/src/components/credits/`

## Out of scope

- Changing any price
- Ads and social posts

## References

- Design: Not needed
- ADR: Not needed
- Legal sign-off: Required. Pending Ajay.

## Review, 3 Oct 2026

| Reviewer | Verdict  | Note                                                                   |
| -------- | -------- | ---------------------------------------------------------------------- |
| Meera    | Approved | Copy goes out only after Vikram signs T-004.                           |
| Madhuri  | Approved | Three worked examples are enough.                                      |
| Ajay     | Approved | Terms and refund wording are mine. Sign-off comes with the final text. |
