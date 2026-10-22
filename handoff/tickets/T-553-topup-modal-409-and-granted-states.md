# T-553: TopUpModal 409 and granted states

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Arjun (design), Vikram (tax presentation), a billing lead (build) |
| Mode   | Full chain |
| Status | To do, after T-540. Not blocking main. Priya, 22 Oct 2026 |
| Source | T-540; Arjun and Vikram, 22 Oct 2026 |

Web TopUpModal handles the quote's 409s and the granted state (full-coupon grant). Must land before the flag `feature.coupon_free_grant` is switched on. Strings to Ajay; Rajesh reviews; builds on T-535's guard.
