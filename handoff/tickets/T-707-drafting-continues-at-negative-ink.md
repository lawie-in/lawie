# T-707: Drafting still works after the Ink balance goes negative

Status: UNCONFIRMED, P1 (downgraded from P0 by Arjun, 30 Oct 2026 17:27 UTC). Anushka did not observe or report it: the smoke account never went below 10 Ink. Waiting on the founder to name the account or the symptom. Meanwhile: Arjun's code check of the hold/settle path, and Anushka's live zero-balance test after the v1.3.1 deploy. Was: P0, open. Raised 30 Oct 2026 by Priya from the founder (Anushka reported it from prod during the model-grid test). Arjun decides who fixes it; it is a money leak.

On prod, the app kept drafting after the account's Ink balance went below zero. A user can draft without paying.

## To find out first
- The exact steps Anushka used and her account's balance trail: Ink history, admin ledger, which actions (describe/intake, generate, revision) ran at a negative balance.
- Whether the hold at generate (withInkHold) checks the balance, or a path skips the hold (form route, generate-from-brief, retries, the T-705 revision route).
- Whether the admin top-up or the +50 grant during the grid test raced a hold.

## Acceptance criteria
1. No paid action (generate, paid revision) starts when available Ink is below its quote; the user sees the existing "not enough Ink" message and Ink is not taken.
2. The balance can never go below zero through normal use; concurrent requests cannot overdraw (atomic check and hold).
3. Tests on every charging path, including concurrent requests.
4. A one-off report of any prod accounts that are below zero now (ids and amounts only), for the founder to decide what to do.
