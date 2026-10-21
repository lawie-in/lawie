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

## Before Anushka tests on develop (founder's three gating items, per Arjun, 21 Oct 2026)
1. The `fact_ledger` flag.
2. Redeploy develop (drafting first, then `yarn workspace @lawie/drafting seed:courts`; then auth, billing, web).
3. The SES key switch.

## Also on the main list (Arjun)
- Live Razorpay keys, live plan ids, a live-mode webhook with a fresh secret; `RAZORPAY_KEY_GUARD=strict` present and `RAZORPAY_ALLOW_TEST_KEYS` absent.
- Ajay's Flex conditions (a) to (e), including the T-532 privacy section 3 text and the timed restore drill.
- Parameter Store entries under `/lawie/prod/*`; main-guard green before any image build.

## Sequencing for the next session
T-533 after the web merges; T-534 then T-537 (one lead in `packages/shared`); T-536 then T-542 (billing, T-527's optional findings are in T-542); T-538 and T-539 after the v1 batch; Ajay byte checks pending: T-541 Terms, T-539 detail string, T-472, T-489, T-521 label list, Hindi FAQ and demo text.

## Added 21 Oct 2026 (night)

- **Tailwind custom breakpoints were dead on develop** from T-528's merge (53234e1e) until the fix `fix/t-528-tailwind-content` (Vishal, found by him): a test's template literal made Tailwind drop every `min-[...]` rule (sticky top bar, nav from 1120, 900px grids, settings layout). Anushka must test develop only after the fix is deployed. A guard test now compiles the real CSS.
- T-527 merged: prod sets `RAZORPAY_KEY_GUARD=strict`, never `RAZORPAY_ALLOW_TEST_KEYS`.
- T-545 (server sends real Ink debit) must merge before main (Ajay, AJ-521-BC).
- New variable to set before deploy: `NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME` (build-time; rebuild web).
