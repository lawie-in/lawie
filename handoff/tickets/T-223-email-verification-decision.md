# T-223 — Do we verify a new user's email?

| Field          | Value |
| -------------- | ----- |
| Phase          | 0 — Prep |
| Owner          | Arjun and Vikram (recommend), Founder (decides), then Lead (build) |
| Mode           | Decision first |
| Status         | Needs a decision |
| Size           | Decision XS. Build M if yes |
| Depends on     | T-220 |
| Gate           | Before v1 go-live, because free drafts can be farmed with throwaway emails |
| Branch         | feature/t-223-email-verification |
| Legal sign-off | Not needed |
| Created        | 2026-10-11 |
| Source         | Founder asked for email scope, 11 Oct 2026. Priya's survey of `apps/email-worker` and `packages/email-client` |

## Question

`User.emailVerified` exists but nothing sets or checks it. Anyone can sign up with an address they don't own and get the free drafts. Options:

- A. Verify before the first draft (link by email). Stops farming; adds a step.
- B. Verify before buying or before the second free draft.
- C. Don't verify in v1; rely on Google sign-in and rate limits.

Arjun and Vikram recommend one with the cost of free-draft abuse; the founder decides. If A or B, this ticket gets acceptance criteria then.
