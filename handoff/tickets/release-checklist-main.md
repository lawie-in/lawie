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
1. **Change the repository's default branch from `main` to `develop`** (GitHub: Settings, General, Default branch). This is a PREREQUISITE for T-533 merging, not only for the first release; no history changes, existing clones are unaffected (Arjun, 22 Oct 2026). Arjun's design keeps no `.github/` on `main`: the guard and deploy workflows live on the default branch only, and the release workflow pushes the snapshot to `main` with `GITHUB_TOKEN`, then dispatches the deploy by ref. Checked 22 Oct 2026: the default branch today is `main`. Scheduled workflows run from `develop` after the switch.
2. Branch protection on `main`: only the workflow bot may push.
3. Add the founder as the required reviewer on the `production` environment. Do NOT restrict that environment to `main`: the deploy workflow runs from `develop` (the default branch) and checks out a main sha, so a main-only rule would block every deploy. Set it to "no branch restriction" (or "protected branches only", with `develop` protected) and rely on the required reviewer (Arjun correction, 22 Oct 2026). `golden-set.yml`'s schedule, if any, will run from `develop`.
4. AC7 (rollback drill) runs as a dispatchable job on a GitHub-hosted runner, not in the sandbox.

## Security note, 22 Oct 2026 (founder decides)
A tester subagent in Vishal's T-522 run printed the cloud session's environment (`export -n`), secrets included, into its own transcript. Nothing reached the repo, a commit, a push or a third party (Vishal's report). Vishal raised it with Arjun and the founder. Rotating the environment's secrets (including the test sign-up secret) is recommended; the call is the founder's and Arjun's. Rule for every crew prompt: never run `env`, `printenv`, `export` (any form) or `set`; to check a variable, test only whether it is set, never print it.
- Env-dump incident (22 Oct): rotation order and the trim list are in `handoff/ops/incident-2026-10-22-env-dump.md` (Arjun). Founder rotates, then removes the product secrets from the cloud environment config. Prevention is T-570.

## Ajay's gate for Anushka's run (22 Oct 2026, after T-559 approval)
All legal MUSTs are closed once T-522 (merged), T-559, T-564 (merged), T-565 (wave 2b + the 1-line fix), T-566 and T-567 are merged and develop is redeployed. Send Ajay the 2023-offence draft from Anushka's run.
Before main (not before Anushka): "Disclaimer slip" checklist lines and criminal_revision 64/65 (T-573), the T-522 Hindi wiring (T-572), the 54d date-scoped validator (T-573 item 3), and the Grievance Officer name set in prod config.
- T-563 (Vishal): `TEST_SIGNUP_BYPASS` and `TEST_SIGNUP_BYPASS_SECRET` must be ABSENT on prod. Auth refuses to boot if either is set on a production box (RAZORPAY_KEY_GUARD=strict, SECRETS_ENV=prod, or an rzp_live_ key). Before Anushka's run ends, the founder runs `yarn workspace @lawie/auth test-accounts:delete --apply` and records the count.

## TOP OF YOUR LIST: incident escalated to HIGH (Arjun, 22 Oct 2026; see handoff/ops/incident-2026-10-22-env-dump.md)
1. Rotate the LIVE Razorpay key pair first, today (the agent environment carried an rzp_live_ pair; the live secret is in a dumped transcript). Then rotate the long-term AWS IAM key.
2. Check the develop box: it may be running LIVE Razorpay keys if its env came from this config (Arjun's T-526 ruling assumed test keys). Count-only check: `grep -c rzp_live_` on the box's env file, never print values. If live: switch to test keys + test plan ids + test webhook, restart, before Anushka's run.
3. Hold Anushka's billing/purchase checks until you confirm (2).
- T-563 runbook (Ajay's condition, 22 Oct 2026): test-account erasure is a manual script. Run `yarn workspace @lawie/auth test-accounts:delete --apply` at the end of EVERY test run and at least weekly (same day if real data turns up), and record the count each time. Owner: founder/ops.

## Needs the founder: Mahak's two merges are blocked by the push permission (22 Oct 2026, evening)
T-472 (limitation computed, merge 4f91e5a0 local only) and T-567 (legal server and export fixes, 4c8bddda) are built, tested, branch-CI green and Ajay-approved. Mahak's pushes to develop_staging were denied twice by the auto-mode classifier ("Auto-Mode Bypass" / "Modify Shared Resources"), in two push forms. Other leads' identical pushes were accepted. Nobody routes around it. Allow Mahak's session to push to develop_staging (or tell me to move them to another lead), and she re-merges origin first. Until then Ajay's list for Anushka is missing T-567; T-472 is not on Ajay's MUST list.
- T-577 (paragraph count) founder step, once it is merged and deployed: seed the AppSettings pricing key `pricing.paragraph_bands.base_2` = `[{"upTo":10,"add":0},{"upTo":18,"add":1},{"upTo":25,"add":2}]` (2 Ink up to 10 paragraphs, 3 up to 18, 4 up to 25). Until it is set, no document asks for a paragraph count and prices are unchanged. On live bail the number is a ceiling ("up to N"; you pay for what is drafted, never more than shown).

## T-587 welcome email: prod worker needs GST_ADDRESS (26 Oct 2026, Priya, from Tanvi)
The email worker refuses a LIVE welcome send without `GST_ADDRESS` (the footer needs the street address, same as the reset and signup-attempt mails). The prod email-worker env must have `GST_ADDRESS` set (name only here; you set the value). It already needs it for reset mails.

## T-610 + T-622 must ship together (26 Oct 2026, Priya, from Ajay T610-F2a f0985461)
Do not cut prod with T-610 unless T-622 (DocumentChoiceStep: no pre-selected card when `unranked: true`) is also merged into develop_staging.

## T-613 + T-628 + T-629 ship together (26 Oct 2026, Priya, Ajay R2-F1 12914711)
Do not cut prod with T-613 (O.39) unless T-628 (past date in the prayer) and T-629 (required fields block Confirm) are also merged. Release step: re-seed courts (`seed-courts`) for the Patna Junior Division record and the Andaman id fix. Founder or ops runs it.

## T-637 before any prod cut carrying T-611 (27 Oct 2026, Priya)
The Templates form route has no T-611 gate until T-637 merges. Do not cut prod for the drafting fixes without it.

## FR-6: feature.fact_ledger must be ON, or the gate must run without it (27 Oct 2026, Ajay 06d18fed)
T-611 and T-637 work only where feature.fact_ledger is ON, and it defaults to OFF. No prod release may be called the fix for Anushka's 26 Oct faults unless the flag is ON in prod or the gate runs without a ledger. The release note must state the flag's value. Arjun is checking the current value via Nikhil.
