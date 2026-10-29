# T-667 — Server balance total excludes earned credits; credit amount hardening

Status: backlog (unassigned). Follow-ups from Kunal's T-653 report, 29 Oct 2026. Related: AJ-664-M1 (Ajay), T-664 (web display, Tanvi).

## Acceptance criteria
1. `getCreditBalance` (apps/drafting credits.service.ts) and the 402 body: `total` either excludes `earnedCredits` or is removed, so no server response offers an earned-inclusive figure as the balance. List every consumer before you change it (the web reads `totalInk` since T-664).
2. Credit spend and grant paths refuse a non-finite or non-positive amount (NaN, Infinity, negative) with a typed error, before any write.
3. Extend the T-653 source scan (no direct earnedCredits spend) to cover `apps/*/scripts`.
4. Tests cover each point; drafting CI stays green.

## Mode
Small fix (drafting only). Billing semantics: Vikram FYI.
