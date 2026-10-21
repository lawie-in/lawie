# T-542: Billing reconcile hygiene (from T-527's review)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release |
| Owner  | Arjun (design), a billing lead (build) |
| Mode   | Small fix (billing); after T-536; NOT blocking main |
| Status | To do. Priya |
| Source | The five optional findings in T-527's last section (Arjun, 21 Oct 2026) |

## Acceptance criteria
Fix or record as accepted (Arjun) each of the five optional findings listed in the last section of `handoff/tickets/T-527-reconcile-before-create-at-razorpay.md`. Billing tests green, Razorpay mocked.

## Added from T-527's delta review (21 Oct 2026)
- `RAZORPAY_KEY_GUARD` fails open on a typo; validate with `z.enum` (T-533 loader).
- Remove the unused `razorpayKeyModeWarning` export.
- `.env.example` wording omits the ALLOW warn case.
