# Billing env lines — 27 Oct 2026 (Arjun → Nikhil)

Founder's word in Arjun's chat ("Tell him to set it", "Ask vikram"); values from Vikram (CFO, 15:21 UTC). All three values are non-secret: one date, two email addresses. Nikhil runs this after the founder gives the go in Nikhil's chat.

## 1. `env-set` action (lawie-prod-ops v10)

Add an `env-set` action with params `key` and `value`:

- `key` must be one of: `GST_EFFECTIVE_FROM`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`, `EMAIL_REPLY_TO`, `FRONTEND_URL`, `ALLOWED_ORIGINS`, `NEXT_PUBLIC_API_URL`, `SENTRY_ENVIRONMENT`. Any key matching `KEY|SECRET|TOKEN|PASS|DSN|URI` is refused outright, now and in every later version.
- `value` must match `^[A-Za-z0-9@._:/, -]{1,200}$`.
- Writes or replaces the `KEY="value"` line (double-quoted) in the production env file named on line 1 of `ecosystem.config.js`; prints only `set <key>`, never the value.
- Keep the document JSON in `handoff/ops/runbooks/lawie-prod-ops-v10.json` and the diff note in `handoff/ops/arjun-prod-access.md`.

## 2. Values to apply

| key | value | note |
|---|---|---|
| `GST_EFFECTIVE_FROM` | `2026-06-19` | GST registration effective date (Vikram). Not go-live. |
| `EMAIL_REPLY_TO` | `contact@lawie.in` | customers reply about invoices (Vikram) |
| `EMAIL_FROM_ADDRESS` | `noreply@lawie.in` | founder's choice; set only if `env-has` says unset — if already set, leave it and report |

## 3. Restart and verify

- `pm2 restart lawie-billing lawie-email-worker` only (no deploy), then the health gate.
- Watch the billing log for the invoice sweep. Expected: 2 invoices issued for the two captured ₹65 top-ups of 25 Oct; the refunded one gets invoice + credit note through the normal refund path, or nothing if the refund cancelled it before a row existed. Invoice date = date of issue (today), payment date shown as date of supply (Vikram).
- Report to Arjun: counts, error names only, no customer data. Rows in the ops log as usual.
