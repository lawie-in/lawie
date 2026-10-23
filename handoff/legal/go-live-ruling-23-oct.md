# Go-live without Anushka's run: Ajay's ruling (23 Oct 2026)

The founder skips Anushka's browser run and ships to production within about 2 hours. This ruling sorts the open legal items into blockers and items that can follow, says what I sign today, and lists the risk the founder accepts.

## A. Blockers: must be true before the first real user. Most are config, minutes each.

1. **Grievance Officer name set in prod config** (`NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME`, AJ-517-M11/M20/M21), and **contact@lawie.in received by the founder** personally (forwarding is fine). IT Rules 2021 r.3(2)(a) requires the officer's name to be published.
2. **Prod database and Privacy §3 must agree.** No paying user on M0 (AJ-DB-1). On Flex or M10, the §3 "We do not currently keep backups" line and the FAQ backup sentence change in the same release to the AJ-DB-2a text, with snapshots in Mumbai and retention of 7 days or less (AJ-DB-2b/c). If §3 is not updated, the Privacy Policy is false on day 1.
3. **GST supplier details in prod config** (GSTIN, legal name, address; config only, never in repo) before the first live payment, so every tax invoice is valid (T-436).
4. **The test sign-up bypass is off in prod.** Confirm the boot refusal on the prod box (T-563): no `TEST_SIGNUP_BYPASS` set.
5. **criminal_revision.** T-566 items 64 and 65 were not applied to it: the pack still tells the model to cite named judgments and to put Lawie's disclaimer inside the pleading. **Either merge T-573 for criminal_revision first, or switch the criminal_revision pack off in prod until it lands.** Everything else in the catalogue is fixed.
6. **Analytics only after consent.** Before opening to users, one person checks in browser devtools on prod: no googletagmanager or google-analytics request before Accept, and no `_ga` cookie after Decline (running-page check 2). This is a DPDP consent point. 10 minutes.

## B. Should be seen running before real users (one person, about 30 minutes, any lead)

7. One **bail draft for an offence dated 2023**: the body cites IPC, not BNS. It contains no "court-ready", no "Lawie is a drafting assistant" inside the pleading, and no judgment the advocate did not give. The disclaimer is shown on the page, and both PDF and Word carry the footer.
8. **Sign-up with an existing email** shows the same "Check your email" screen. The verify mail says 30 minutes and contact@ (T-522, T-559).
9. A user who chooses **"Not now"** on the privacy prompt can still cancel their plan and close their account (T-567 item 23).
10. The footer and Privacy §11 show the **Grievance Officer line with the name**, not the fallback.

If items 7–10 are not seen before launch, the founder accepts that risk (see D).

## C. Can follow within days (not blockers)

11. The "Disclaimer slip — Lawie drafting assistance acknowledged" checklist line in about 36 packs (T-573): misleading but low harm. Fix within a week.
12. The T-522 Hindi wiring (T-572): users in Hindi mode see English, which the rulings allow.
13. The 54d date-scoped validator: the signed neutral S11a warning is live meanwhile.
14. The privacy@ mentions left in old signed handoff docs: history only; nothing user-facing.
15. The remaining running-page checks (resend throttle, street address in mails, supplier lines in the Terms) on the first day.
16. Processor contracts (DPDP s.8(2)) with Anthropic, AWS, Sentry, Razorpay and the mail provider, and the cross-border transfer review: put in place within 30 days. Their terms of service govern meanwhile.

## D. What I sign today

Every ticket I byte-checked and approved is signed for production as merged: T-472, T-473, T-477, T-478(b), T-479, T-482, T-483, T-488, T-489 (conditions), T-496, T-517, T-521, T-522, T-525 follow-ups, T-535, T-539, T-541, T-544, T-545, T-549, T-554, T-555, T-557, T-559, T-563 (develop only), T-564, T-565, T-566, T-567, T-577 (server and web), T-578 and T-579. This holds only as merged at the SHAs I approved. Any later change to legal text comes back to me.

**Risk the founder accepts by skipping Anushka** (record it in the release note):
- No lawyer has run the product end to end in a browser. Draft quality, flow errors and any copy I could only check in code (D-list items 7–10 if skipped) go unverified by a lawyer before real users.
- The drafts carry the signed disclaimers, so the advocate bears filing responsibility. But a visibly wrong draft (wrong code, wrong court, wrong party) costs trust and invites complaints. These go to the Grievance Officer within 24 hours / 15 days.
- The founder's own rule (CLAUDE.md quality gate, 8 Oct) requires Anushka's PASS before main. Skipping it is his decision to make and record. I do not sign it as passed.
