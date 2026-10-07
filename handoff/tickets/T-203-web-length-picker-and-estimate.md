# T-203 — Web: length picker, estimate and drops balance

| Field      | Value                             |
| ---------- | --------------------------------- |
| Phase      | 2 — Drops pricing                 |
| Owner      | Vishal                            |
| Mode       | Full chain                        |
| Status     | Blocked: T-202 and T-109          |
| Depends on | T-202, T-109                      |
| Branch     | feature/t-203-length-and-estimate |
| Created    | 2026-10-03                        |

## Goal

The user chooses a length, sees the cost in drops, and confirms before drafting.

## Context

- Founder: "We will give an estimate to the user before drafting."
- Balance and paywall components live in `apps/web/src/components/credits/`: `HeaderCreditPill`, `LowBalanceModal`, `PaywallModal`, `TopUpModal`, `DraftReadyModal`. The hook is `apps/web/src/hooks/useCredits.ts`.
- The header today reads "5 Ink FREE".

## Acceptance criteria

- A length picker shows the default for the document type and cannot go below its minimum.
- An estimate in drops updates as the length changes.
- The user confirms the estimate before generation starts.
- After the draft, the screen shows the drops actually charged.
- The header balance shows drops.
- The low-balance modal opens when the estimate is more than the balance.
- The screens match Rajesh's design.
- `apps/web` has no tests and is not in CI. The PR includes a checked list of manual checks with screenshots at 360 px and at desktop width, and `yarn workspace @lawie/web build` passes.

## In scope

- `apps/web/src/components/credits/`
- `apps/web/src/hooks/useCredits.ts`
- `apps/web/src/app/dashboard/new/`

## Out of scope

- Marketing and pricing pages (T-204)
- The admin credit-ledger screen

## References

- Design: T-005 and T-109
- ADR: Not needed
- Legal sign-off: Not needed

## Review, 3 Oct 2026

| Reviewer | Verdict               | Note                     |
| -------- | --------------------- | ------------------------ |
| Arjun    | Approved with changes | Manual-check rule added. |
| Rajesh   | Approved              | Waits on T-005.          |
