# T-598: auth/billing — write the audit events the admin log already lists

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (founder observation on prod: admin Audit log shows 0 events; DPDP claim in the page header) |
| Owner  | Arjun (design), Ajay (retention), a lead (build; auth + billing) |
| Mode   | Full chain (two services: auth, billing). No UI change, Rajesh not needed |
| Status | To do. Raised by Arjun, 26 Oct 2026. Not tonight: after T-587 and T-590 (same auth files). Priority below the email tickets, above T-592. Priya |
| Source | Arjun's note from the founder's prod observation |

## Problem
apps/auth/src/models/AuditLog.model.ts declares eventType [login, logout, payment, data_export, account_delete, password_change, plan_change], but the only writer in the repo is account-erase.service.ts (account_delete). The page header promises "Security events · DPDP Act compliance · 2-year retention" that the data does not back.

## Acceptance criteria
1. auth writes: login (success and failed; severity warning after N failures; never a password or token), logout, password_change (reset complete and change), data_export (if an export route exists, else drop the type). account_delete already done.
2. billing writes: payment (top-up captured, subscription charged or failed: amount, order and payment id, no card data), plan_change (activated, cancelled, paused, halted). Billing has no AuditLog model: it POSTs to a new auth internal route `/internal/audit` (INTERNAL_SECRET, same shape as the T-587 route). No shared model (Arjun's call).
3. Retention: a 2-year TTL index on createdAt, only after Ajay confirms 2 years is right under DPDP for security logs. If he says otherwise, change the header text, not the law.
4. No PII beyond userId, ip and userAgent. Never emails, never document content.
5. Tests per event. Auth and billing tests and build green.

## Files
Claimed by Priya when a lead takes it, after T-587 and T-590 merge. Likely: apps/auth AuditLog.model.ts, auth login/logout/password services, new internal audit route, apps/billing subscription.service.ts hooks and a small audit client.
