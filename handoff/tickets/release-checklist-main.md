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

## Founder action (low severity, noise only), 21 Oct 2026
Stray test traffic reached the develop box (api.lawie.in) from T-531 browser checks, 22:40 to 23:55 UTC. Arjun's note: `handoff/ops/incident-2026-10-21-stray-e2e-traffic.md`. Recommended: in mongosh, count then delete consent records created in that window whose user-agent contains HeadlessChrome; note the count. Nothing authenticated was served.

Ajay's conditions for that cleanup (21 Oct 2026): (a) count first; the filter matches only the window + HeadlessChrome (about 60 rows) so no real tester row (Anushka, founder) is caught; (b) record the count and the filter in the incident note, without ids; (c) from now on e2e never writes to a real consent log (stub it or tag test traffic). On prod, consent rows are never deleted, only marked invalid with a reason.

## Flags list (22 Oct 2026)
T-540 adds the AppSettings key `feature.coupon_free_grant` (default OFF). Turn it on only after T-553 (TopUpModal granted and 409 states) has shipped. Follow-ups after T-540: T-551 (invoice discount line), T-552 ("Coupon, ₹0" history row), T-553.

T-540: switch `feature.coupon_free_grant` stays OFF until T-553 AND T-556 item 1 have shipped. While off, a 100% coupon shows "cannot apply".

## Tests read handoff/ (22 Oct 2026, Vishal's T-555 reviewer)
Several web tests read `handoff/legal/*` at test time (for example the byte-for-byte comparisons with signed strings). The main release snapshot strips `handoff/`, so CI on main would fail those tests together. Decide before the first cut of main: run tests only on develop, or copy the signed strings into a committed fixture the tests read, or skip those tests when `handoff/` is absent. Arjun (release-to-main.yml, T-403).

## Founder steps for T-536 (run on develop BEFORE deploying billing with T-536; 22 Oct 2026)
1. In one shell, point at develop: `export MONGO_URI=<develop URI>` (do not paste it anywhere), or leave it unset and set `NODE_ENV` so the script loads `.env.<NODE_ENV>`.
2. From the repo root: `yarn workspace @lawie/billing check:live-sub-duplicates` (read-only, no arguments).
3. Check the redacted target printed is develop. `db.version()` must be 6.0 or higher, or do not deploy.
4. Exit 0 = clean, deploy. 1 = duplicates found (ids, status, createdAt only, no PII) or the check failed. 2 = connect or usage problem.
5. If there are duplicates: for each user pick the real row and set the other to a terminal status by hand. Re-run until exit 0. The script never writes.
6. After deploy the index builds at boot. If duplicates remain, billing logs "live index create failed" plus a Sentry error and still starts, with the guard off. Fix the duplicates and restart billing.
Repeat on production before main (there are no production subscriptions yet, so the check should be clean).

## T-563 test sign-up bypass: founder steps and conditions (22 Oct 2026; Arjun's design reconciled with Ajay, stricter version kept: see the ticket)
- Test users use reserved test domains only (`@example.com`, `@example.org`, or any `.test` address, for example `TEST_anushka@lawie.test`); any other address is an ordinary sign-up. (`@test.lawie.in` is NOT used, so no DNS step is needed.)
- The founder generates the secret himself (`openssl rand -hex 32`, `lts_` prefix per Arjun's design), sets `TEST_SIGNUP_BYPASS=true` and `TEST_SIGNUP_BYPASS_SECRET` on the develop box, and `LAWIE_TEST_SIGNUP_SECRET` in the cloud-session environment. Never in a file, chat, ticket or log.
- Production: BOTH `TEST_SIGNUP_BYPASS` and `TEST_SIGNUP_BYPASS_SECRET` ABSENT. Production boot refuses to start if either is set.
- Test accounts are synthetic only (consent version `test-bypass`, excluded from consent exports). They are erased within 7 days of creation; at the end of Anushka's run the founder runs `yarn workspace @lawie/auth test-accounts:delete --apply` (dry-run first; default `--older-than 1d`). Develop only.

## Ajay's ten running-page checks: who does what (22 Oct 2026, pre-Anushka legal review)
- Anushka in the browser: #3 (`describe_first` on for her; which packs are live), #4 (review-before-filing notice on every opened draft; check a PDF and a DOCX export), #5 (a form-path draft for an offence in 2023 must cite IPC, no "Lawie is a drafting assistant" in the body, no case name the advocate did not give, no "court-ready"; send the draft to Ajay, he reads it himself), #6 (unverified Free user at 0 Ink; a Solo user's plan label), #7 (a "Not now" privacy user can cancel and then close the account), #10 (supplier lines in Terms sections 1 and 14 load).
- A lead or Arjun (devtools, mail, config): #2 (any request to Google Analytics or Tag Manager before Accept; a _ga cookie after Decline), #8 (resend throttle shown versus the server limit; sent mails show the real street address with no placeholder marker), #1 (`NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME` set: founder), #9 (database tier in prod; `support@` mailbox monitored: founder).
- Flags for Anushka's run: `feature.describe_first` ON, `tool_bail_checker` OFF.

## T-533 founder steps (Arjun's calls, 22 Oct 2026; before T-533 merges and before the first release)
1. **Change the repository's default branch from `main` to `develop`** (GitHub: Settings, Branches, Default branch). Arjun's design keeps no `.github/` on `main`: the guard and deploy workflows live on the default branch only, and the release workflow pushes the snapshot to `main` with `GITHUB_TOKEN`, then dispatches the deploy by ref. Checked 22 Oct 2026: the default branch today is `main`. Side effect to expect: new pull requests default to `develop`; scheduled workflows run from `develop`.
2. Branch protection on `main`: only the workflow bot may push.
3. Add the founder as the required reviewer on the `production` environment (restrict that environment to `main`).
4. AC7 (rollback drill) runs as a dispatchable job on a GitHub-hosted runner, not in the sandbox.
