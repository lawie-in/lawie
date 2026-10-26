# T-621: The Hindi interface changes only part of the home page

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (severity P2 unless Hindi is a v1 promise: Arjun/founder decide; from part 2 of the prod check) |
| Owner  | Rajesh/Madhuri (strings), Ajay (signs), a web lead (build) |
| Mode   | Full chain (web, UI) |
| Status | To do. Raised by Priya from Anushka's prod FAIL. Not assigned. Priya |
| Source | handoff/quality/2026-10-26-prod-drafting-FAIL.md, item 12 |

## Problem
The first click on हिन्दी did nothing; the second worked. Only the home page changes, and only partly: 'Documents', 'Prices', 'FAQ' and 'Sign in' stay English. The dashboard and New document stay entirely in English. Signed in, the home page still shows 'Sign in' and 'Start with 5 free Ink'. (Related: Hindi input to the drafter is not proven end to end; the landing copy dropped 'in English or Hindi' for that reason.)

## Acceptance criteria
1. Decide the promise: either Hindi is a v1 feature (then signed Hindi strings for nav, dashboard and New document, and a toggle that works on the first click) or the Hindi toggle is hidden until it is.
2. Signed-in state never shows sign-in/sign-up calls to action.
3. Ajay signs any new Hindi strings.
