# T-509: Web: plan chooser, cancel and subscription status in Settings

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Rajesh (design), Ajay (copy) (design or review), a lead (build) |
| Mode   | Full chain |
| Status | To do. V1 (Priya, 17 Oct 2026). Unassigned until Priya claims a lead |
| Files  | apps/web (settings page, PlanUpgrade, new components) after Rajesh's design |
| Source | V1 UI checklist, Arjun's code scan (17 Oct 2026) |

## Problem

Settings offers only Upgrade to Pro, hardwired to pro_monthly. Solo cannot be bought in the app; a Solo user sees a Pro upsell with no cancel option; the Cancel and Manage buttons do nothing.

## Acceptance criteria

1. Plan chooser shows Free, Solo and Pro (monthly) with the same prices and Ink as the pricing page; the user can buy either paid plan.
2. A subscribed user sees plan, renews on, state (active, lapsed, payment failed) and a working Cancel (confirm step, takes effect at cycle end).
3. Payment failed and retry state; the page after payment never shows stale Ink (shows pending until the webhook lands).
4. The verify-email and privacy-acceptance gates show a clear message and the way to fix them, not 'Order creation failed'.
5. Dead buttons removed or wired. Yearly stays hidden (T-399).
6. Depends on T-508 and Rajesh's design.
