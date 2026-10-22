# T-575: Internal immediate-cancel route for account erasure

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (follow-up to T-563; before real account erasure ships; not blocking v1) |
| Owner  | Arjun (design), a lead (build; apps/billing and apps/auth) |
| Mode   | Full chain (billing, auth) |
| Status | To do. Raised by Arjun, 22 Oct 2026. After Shashank's current billing merge. Parked until after Anushka's first run. Priya |
| Source | Arjun's note on T-563 |

## Problem
Auth's erase path (used for T-563 test accounts, and later for real account erasure) runs without cancelling the user's subscription at Razorpay. Ruled in T-563 as safe for now because test accounts run in test mode only. Real erasure needs the cancel first.

## Acceptance criteria
1. New billing route `POST /internal/cancel-subscription` with body `{ userId, immediate: true }`, behind `INTERNAL_SECRET` (same guard as the other internal routes).
2. Cancels the user's live subscription at Razorpay immediately; idempotent when there is none or it is already cancelled; never logs PII.
3. Auth's erase path calls it before erasing, and aborts the erase (with a clear error) if the cancel fails.
4. Tests on both sides; Arjun reviews the contract.

## Files
Claimed by Priya when a lead takes it, after Shashank's billing work and Vishal's T-563 have merged.
