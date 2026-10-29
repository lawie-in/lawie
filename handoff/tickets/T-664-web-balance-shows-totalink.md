# T-664 — Every balance the web shows is totalInk

Status: assigned to tanvi, 29 Oct 2026. Ajay ruling AJ-664-M1 (bcc1b832), found in Kunal's T-653 Explore.

## Why
The spend gate (`enforceCredits`) and the 402 message use `totalInk`. The web paywall (`apps/web/src/app/dashboard/new/page.tsx` ~l.424) shows `balance.total`, which includes the legacy hidden `earnedCredits`. So a user can be refused a draft while the paywall shows a balance that covers it.

## Acceptance criteria
1. The paywall on dashboard/new shows `totalInk` from the 402 body. It shows the same figure as the 402 message and OneFlow.
2. Sweep `apps/web/src` for any other place where `balance.total` (or another earned-inclusive figure) reaches a user, and switch each one to `totalInk`. On 29 Oct, grep finds only page.tsx:424; say what the sweep found.
3. A web test pins it: with a 402 body where total > totalInk, the paywall shows totalInk.
4. No copy change. Ajay byte-checks the branch head before merge.

## Out of scope
Server-side credit logic (Kunal's T-653), and the billing settings cards (Shashank's T-646).

## Mode
Small fix (web only, one service).
