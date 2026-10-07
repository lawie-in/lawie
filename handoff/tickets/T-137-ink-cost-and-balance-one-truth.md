# T-137 — Ink: the cost before I spend, and one true balance

| Field      | Value                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| Phase      | 2 — Ink                                                                                                       |
| Owner      | Vikram (what is true), Priya (scope), Vishal (build), Anushka (verdict)                                       |
| Mode       | Full chain, then the quality gate                                                                             |
| Status     | Needs scoping. Not started. Cause not traced yet                                                              |
| Depends on | None                                                                                                          |
| Branch     | fix/t-137-ink-cost-and-balance-one-truth                                                                      |
| Created    | 2026-10-06                                                                                                    |
| Source     | Anushka's run 1, 6 Oct 2026, verdict FAIL. Her words are in `handoff/quality/2026-10-06-baseline-run-FAIL.md` |

## Goal

A lawyer always knows what a draft will cost, what is left, and what each plan buys, and every screen says the same.

## What Anushka found

- **Blocker.** No cost is shown before "Confirm brief and continue" starts the draft.
- The balance read 5, then 5 on the draft-ready page and in the editor, then 3, then 2 after the second draft, then 5 again at the end with nothing bought. At that point the dashboard said "5 Ink" beside "You have 3 documents remaining this month" and "2 of 5 documents used".
- Pricing page: "Each document you generate uses 1 Ink". Her first document took 2.
- Home page: "5 Ink (lifetime)". Dashboard: "Free plan: 5 documents/month". In the app: "Upgrade to Pro — ₹799/month", "Unlimited document generations". Pricing page: Solo ₹799 with 50 Ink, Pro ₹1,999 with 150 Ink.

## Acceptance criteria (draft, Priya to confirm)

- Vikram writes the one true statement of: what a draft costs, what the free tier is, what each plan is and costs. Every screen is changed to match it.
- The cost is on screen before the step that spends it.
- The balance is right on every page straight after a draft, and the reason it went back to 5 is found and written here.
- Anushka tests again from the start and her verdict is PASS.

## Notes

- Overlaps T-201 to T-204 (the move to drops and paragraph-based charge). Priya to say whether this is fixed inside them or before them.
- Not known: whether the founder's account really has 5 Ink again or only shows it.
