# T-224 — Payment and balance emails

| Field          | Value |
| -------------- | ----- |
| Phase          | 2 — Drops pricing |
| Owner          | Vikram (what a receipt must hold, GST), Madhuri (copy), Ajay (terms), Lead (build), Anushka (verdict) |
| Mode           | Scope after drops pricing settles |
| Status         | Blocked: drops pricing (T-201 to T-205) and T-220 |
| Size           | M |
| Depends on     | T-201, T-202, T-204, T-220, T-225 |
| Gate           | Before paid launch |
| Branch         | feature/t-224-billing-emails |
| Legal sign-off | Ajay (terms and refund wording), Vikram (GST invoice fields) |
| Created        | 2026-10-11 |
| Source         | Founder asked for email scope, 11 Oct 2026. Priya's survey of `apps/email-worker` and `packages/email-client` |

## Scope (to confirm when unblocked)

Payment received (with a GST-compliant receipt or invoice link), payment failed, balance running low. The `billing.*` template ids in `packages/email-client` predate drops pricing and are renamed to match it.

## Out of scope

- Monthly invoices, if Vikram confirms per-payment receipts are enough for v1
