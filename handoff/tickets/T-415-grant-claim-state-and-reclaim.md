# T-415: grant claims carry a state, so a stuck claim can be re-claimed

| Field  | Value                                                                                           |
| ------ | ----------------------------------------------------------------------------------------------- |
| Status | Merged into develop_staging 42703a4 (Kunal, 14 Oct 2026). Waiting for Anushka on develop. Priya |
| Owner  | Kunal (build), Arjun (call)                                                                     |
| Mode   | Full chain (billing grant logic; Kunal, 13 Oct)                                                 |

## Why

From T-413's review (Arjun). A claim is written before the grant. If the process dies between the two, the claim stays taken, every retry is a no-op, and the user never gets the Ink.

## Acceptance criteria (Arjun; full spec in T-413's last section)

1. Top-up claims and T-399 subscription grant claims carry a state (pending or granted) and a timestamp.
2. A pending claim older than 60 s can be re-claimed by a retry. A granted claim never can.
3. Tests cover a crash after the claim followed by a retry that grants exactly once, and a granted claim that blocks a retry.

## Files

apps/billing/src/services/ink-ledger.service.ts and subscription.service.ts (Kunal's row), plus tests.
