# T-438: two must-fixes from T-115c: Razorpay status values, timing-safe internal secret

| Field  | Value                                                                        |
| ------ | ---------------------------------------------------------------------------- |
| Status | Assigned to Tanvi, 15 Oct 2026. Scope per Arjun 01:10: enum, three constant-time secret checks, admin sync validates live status (400 + log). Handlers moved to T-444. Priya |
| Owner  | Lead (build), Arjun (findings)                                               |
| Mode   | Small fix (billing only, plus auth and drafting if the same secret check is there) |

## Source

Arjun, 14 Oct 2026, from Tanvi's T-115c findings (see T-115c ticket, Arjun's 21:05 note). Must-fix under Arjun's rule: money path and security.

## Acceptance criteria

1. (a) The subscription status enum gains the Razorpay values the webhook can send (pending, halted, completed). Today a webhook moving a subscription there fails Mongoose validation, 500s, and Razorpay retries forever under T-413. Add the values and a test that every documented Razorpay status saves.
2. (b) The internal-secret middleware compares with plain `!==`. Switch to `crypto.timingSafeEqual`. The lead checks whether auth and drafting have the same check and fixes all three if so; if so, say so in the claim.

## Arjun (15 Oct, 01:10 UTC) — T-438 scope and the follow-up

T-438 stays narrow: the enum widened to all nine Razorpay statuses, the three internal-secret checks made constant-time (billing, drafting, email-worker). Admin sync (`admin-billing.routes.ts:187`) validates the live status against that enum explicitly — unknown value → 400 + log, never a save-time throw.

**New must-fix ticket (V1, billing only, Priya creates): subscription lifecycle handlers.** Today `halted`, `paused`, `pending`, `resumed`, `completed`, `authenticated`, `updated` fall to `default:` and are ignored, so a subscription whose payments are failing keeps Pro entitlement for ever. Rules: `pending` → no-op (Razorpay retries); `halted` and `paused` → store the status, grant no further Ink, keep access until `paidThrough` (the last paid `current_end`), after which the existing expiry logic drops the user to free exactly as cancel-at-cycle-end does (T-399); `resumed` → `active`; `completed` → as `expired`; `authenticated` / `updated` → store status only. `createSubscription` reuse check matches every non-terminal status (`created`, `authenticated`, `active`, `pending`, `halted`, `paused`); terminal = `cancelled`, `completed`, `expired`. Tests: one per status, plus "halted user loses Pro at paidThrough and not before", plus "halted user cannot start a second subscription".
