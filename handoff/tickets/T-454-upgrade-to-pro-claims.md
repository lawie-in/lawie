# T-454: "Upgrade to Pro" claims that are false or stale (four places)

| Field  | Value |
| ------ | ----- |
| Status | To do. V1 (a live false claim). Lead to be assigned. Priya, 15 Oct 2026 |
| Owner  | Lead (build), Ajay (signs the replacement text) |
| Mode   | Small fix, full chain (user-visible copy) |

## Source

Tanvi's T-398 Explore; Ajay, 15 Oct 2026 (Risk, not dead code).

## Places

1. `apps/drafting/src/middleware/enforceFreeLimit.ts:60`: "Upgrade to Pro for unlimited access". "Unlimited" is false.
2. `apps/gateway/src/middleware/rateLimiter.ts:46`: "Upgrade to Pro for higher limits".
3. `apps/web/src/app/dashboard/page.tsx:305`: an "Upgrade to Pro" button.
4. `apps/web/src/app/dashboard/documents/[id]/page.tsx:573-583`: "Free tier exports include a watermark" with an "Upgrade to Pro" link. The watermark claim is live and false (Pro is not a watermark gate; Ajay's T-398 removed the claim from the pricing page).

## Acceptance criteria

1. Replacement text for all four, written by Madhuri, signed by Ajay: no "unlimited", no watermark claim, "free" only with "5 Ink", Pro named only where allowed (pricing page).
2. Tests updated; no yearly text.
