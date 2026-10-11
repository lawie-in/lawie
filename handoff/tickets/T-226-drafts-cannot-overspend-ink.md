# T-226 — A user cannot draft past their balance

| Field          | Value |
| -------------- | ----- |
| Phase          | 0 — Prep |
| Owner          | Arjun (mechanism: hold before, settle after), Vikram (heads-up), Lead (build), Anushka (verdict) |
| Mode           | Arjun's call first, then build, full chain (drafting, billing) |
| Status         | To do. Waits for Arjun's mechanism. Build after T-197 merges (it holds documents.routes.ts) |
| Size           | M (1 day) |
| Depends on     | T-197 (file overlap) |
| Gate           | Before v1 go-live (T-403) and before paid launch |
| Branch         | fix/t-226-no-overspend |
| Legal sign-off | Not needed |
| Created        | 2026-10-11 |
| Source         | Vikram, while costing T-223, 11 Oct 2026. Priya checked the code |

## Problem

`apps/drafting/src/middleware/enforceCredits.ts` checks the balance before a draft. `apps/drafting/src/routes/documents.routes.ts` charges with `spendInk` only after the draft is done (three places: template, guided, legacy). If the charge fails, it is only logged and the draft is still delivered. So a user who sends several drafts at once gets them all on a balance that covers one, including free Ink.

## Acceptance criteria

1. Arjun picks the mechanism (for example, hold the cost atomically before the run and settle or release it after) and writes it here.
2. With a balance for one draft, N parallel requests give exactly one draft; the others are refused with the same message as an empty balance.
3. A failed or cancelled run releases its hold; the user is not charged.
4. No path delivers a draft without a successful charge or hold. A charge failure after the run is an error the user sees, not a log line.
5. The duplicate-attempt rule (one charge for one logical draft) still holds.
6. Tests cover parallel requests, failure release and the duplicate attempt, for all three generate paths.

## Out of scope

- Drops pricing itself (T-201 to T-205)
- Email verification (T-223)

## References

- T-223 (Vikram's note), T-152, ADR-020
