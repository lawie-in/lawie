# Release to main: what must be true (founder checklist, kept by Priya)

Updated 21 Oct 2026. Nobody merges into `main`: `release-to-main.yml` (T-533) cuts it from `develop`, the founder approves.

## Tickets that must be merged first
T-519 (done), T-522 (neutral sign-up, unverified login, Google consent), T-527 (reconcile before create), T-533 and T-534 (pipeline, secrets loader), T-535 (top-up copy), T-536 (one live subscription index), T-537 (scale-out readiness), T-540 (top-up quote), T-541 (Terms wording and version bump), T-528 (landing/auth fixes), T-532 (privacy backup text, only with the Flex cluster).

## Founder actions (no code)
- Set `NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME` to `Abhinav Anand` on the web deploy; forward contact@lawie.in to your own inbox (AJ-517-M21).
- Razorpay: live keys and live plan ids in the prod environment's secrets; live-mode webhook registered for the prod URL with a fresh secret; test-mode webhook left on develop.
- `RAZORPAY_KEY_GUARD=strict` present and `RAZORPAY_ALLOW_TEST_KEYS` ABSENT in the real production environment.
- Run the Razorpay sandbox check recorded in T-516.
- Atlas Flex cluster with 7-day retention in Mumbai; one timed restore drill.
- Fix by hand any user with more than one live subscription before T-536's index lands.
- Anushka tests on develop and gives her PASS.
