# T-667 — Server balance total excludes earned credits; credit amount hardening

Status: merged into develop_staging e4990fba (kunal, CI green), 29 Oct 2026. MAX_VALUE cap question goes to T-670 (Vikram).

## Acceptance criteria
1. `getCreditBalance` (apps/drafting credits.service.ts) and the 402 body: `total` either excludes `earnedCredits` or is removed, so no server response offers an earned-inclusive figure as the balance. List every consumer before you change it (the web reads `totalInk` since T-664).
2. Credit spend and grant paths refuse a non-finite or non-positive amount (NaN, Infinity, negative) with a typed error, before any write.
3. Extend the T-653 source scan (no direct earnedCredits spend) to cover `apps/*/scripts`.
4. Tests cover each point; drafting CI stays green.

## Mode
Small fix (drafting only). Billing semantics: Vikram FYI.
