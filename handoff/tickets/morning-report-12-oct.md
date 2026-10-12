# Morning report, 12 Oct 2026, 08:30 IST (Priya). A report, not a request

Nothing here blocks the team and I need no approval. Merging to `develop` or `main` is yours and is not listed.

## Merged into develop_staging overnight (waiting for Anushka on develop)
T-208, T-209, T-210, T-197, T-189, T-194, T-227, T-248, T-251, T-200, T-252a, T-235 + T-254A; CI-only: T-211, T-249. CI is green on every merge (last: #380, #381).

**What a user can now do (the new ones since last night):**
- Draft bail with the sections and grounds they gave appearing in the draft, and a warning before they export a draft with blanks still to be confirmed (T-189, T-194).
- See the price before it is charged and be charged exactly that (T-227).
- Get correct BNSS citations in review petitions, habeas corpus and discharge forms (T-248).
- Get default bail offered (needs the setting below) and a clause check that is honest about what is in the draft (T-251, T-200).
- Read a privacy policy that says what is stored, what is encrypted, who receives it and how to ask for erasure; no false security claims; no sample PDFs offered; the converter makes no "validated" claim (T-235, T-254A, T-252a).

## Where each lead is
- Shashank: T-250 + T-255 (corrected IEA→BSA and CrPC→BNSS tables) chain complete; first in the merge queue. Next: T-267 (IPC→BNS table, Ajay signed).
- Vishal: T-256 + T-264 (flaky test, golden fixture) chain complete; second in the queue.
- Mahak: T-233 + T-271 (export file bugs, privacy polish) in review; third in the queue.

## Decisions I took for you (all logged in tickets)
Vikram's prices and the two-tranche marketing budget; chatbot design and caps (T-253); CI skips docs-only pushes; converter claim removed; email/password sign-up in this release; T-275 labels for repealed rows; no production reseed until it is merged.

## Your to-dos (need your logins)
1. **`feature.fact_ledger`** app setting, same value as `feature.describe_first`, before Anushka tests T-189 and T-251.
2. **SES and DNS for T-220** (the "policy changed" email and verification mail). Once T-223 merges, the develop email worker also needs `AUTH_SERVICE_URL` set (step 7 of the email doc, Arjun).
3. **The registered address, with PIN code,** for the privacy policy, invoices and the footer of the verification email (T-223; no verification email goes out until it is filled).
4. **Rotate `INTERNAL_SECRET`** after T-229 merges.
5. **Production section reseed** (your database), only after T-250 + T-255 and T-275 are merged; develop first.
6. The rest of the list below, when you choose.

---

## Full list from the earlier draft

Nothing below blocks the team. Each item is for you to do when you choose. Merging to `develop` or `main` is yours and is not listed.

## Merged into develop_staging overnight
T-227 (shown price = charged price), T-249 (CI skips docs-only pushes), T-248 (three wrong BNSS citations), T-194 (export warns about blanks), T-251 (default-bail fix), T-200 (clause check is honest). Earlier: T-189, T-208, T-209, T-210, T-211, T-197. CI is green on every merge so far.

## In flight
- T-250 + T-255 (Shashank): corrected IEA→BSA and CrPC→BNSS tables (117 and 103 wrong rows), round 3.
- T-252a + T-235 + T-254A (Mahak): converter false claim removed, new privacy page, sample links removed.
- T-256 + T-264 (Vishal): flaky test and stale golden fixture.
- Next: T-237, T-241, T-245a/b, T-257 to T-260 (batch 1 templates), T-267 (IPC→BNS table), T-253 chatbot build.

## Founder-only, do when you choose
1. **Anushka's run setup:** add the app setting `feature.fact_ledger` with the same value as `feature.describe_first` (your user id or the list). Never "on". Needed for T-189 and T-251; default bail isn't offered without it.
2. **Production reseed of the section tables** after T-250 + T-255 merge (your database). Develop first, 20 sample rows; Arjun confirms only seeded rows exist before `--force`.
3. **Razorpay dashboard:** confirm the plans charge exactly ₹799, ₹7,990, ₹1,999 and ₹19,990.
4. **Is the live site publicly reachable today?** The converter page's false claim is being removed; I treat it as live until I know.
5. **Cash on hand** (to confirm the ₹1,00,000 marketing budget at launch) and **GST status** with a CA (the pricing page says prices include tax).
6. **Facts only you can confirm:** Atlas region; Redis Cloud region; Sentry region; whether we have a zero-retention agreement with Anthropic; whether to move off Atlas M0 for backups before v1; pm2 log rotation on the server.
7. **Grievance Officer's name** for the privacy policy §11.
8. **A practising advocate to review each template batch** before it goes live (Ajay's condition).
9. **Switching the new "describe your matter" flow on for all users** at go-live (`feature.describe_first` / `fact_ledger`), when you choose.
10. **Chatbot launch steps (later):** two Anthropic keys (chat $25/month, nightly test $5), four settings (`ai.assistant_model`, `ai.rates.claude-haiku-5-5`, `finance.usd_inr=96.5`, `chat.canary`), and `chat.enabled=false` until Anushka passes it.
11. **Auto-renew and pre-debit consent wording** for recurring payments: Vikram and Arjun first, then you.
12. **Meera is paused** by you; her marketing drafts (strategy, 22 posts, 3 reels, page copy) are all in `handoff/marketing/`, drafts only.

## Decisions I made for you (all logged in tickets)
Vikram's prices; marketing budget cut to at most ₹1,00,000 in two tranches; Solo ₹799 and top-ups final, Pro under review; chatbot design and caps; CI skips docs-only pushes; the section-converter claim removed now.


Note added 12 Oct: do not reseed the production section tables until T-275 (converter label for repealed rows) is merged.

Update 12 Oct: T-250 + T-255 and T-275 are both merged, so the production reseed condition is met once T-267 (IPC table) is also merged and develop has been reseeded and checked first.

New risk, 12 Oct: T-277 (HIGH). The BNS offence table has 67 of 305 rows under the wrong key, so the bail checker can show the wrong bailability for a section. Ajay is rebuilding it and will sign; nothing to do from you, but treat the bail checker as unreliable until it merges.

From Arjun's scoping, 12 Oct: T-220 needs one founder session (SES production access and identity, DNS records, IAM keys, the production environment file, the pm2 check, the contact@lawie.in alias). T-115 needs the founder to read the Atlas tier and run the production migration.

Arjun's founder tasks, 12 Oct (his session): (a) back up the encryption key OFFLINE before any backfill: losing it loses every draft and there are no database backups; (b) the T-220 session, in this order: SES production-access request first, then the sending identity and DNS, then the IAM keys and the production environment file, then the contact@lawie.in alias; (c) run the encrypt backfill on production (develop first); (d) the Atlas tier and region; (e) cancel paying users' Razorpay plans by hand until a cancel path exists.

From Arjun, 12 Oct: add FEATURE_DEFAULT_DESCRIBE_FIRST=on and FEATURE_DEFAULT_FACT_LEDGER=on to the develop environment file (or set the two AppSettings once in admin). Chatbot (T-253): two Anthropic keys ($25 chat, $5 eval), chat key in the production environment file, eval key as a GitHub secret, seed the AppSettings, flip chat.enabled only after Anushka's PASS.

T-285 (long repairs drop the stream) needs no founder task: Arjun's fix is a keep-alive in code.

From Vishal, 12 Oct (when convenient, 1 minute): delete the leftover branch `throwaway/t269-ci-probe` on GitHub (Branches page). It holds a deliberate type error used to prove T-269 and never merges; sessions cannot delete remote branches.

From Arjun, 12 Oct (after T-306 is on develop): flush all login sessions on develop (Redis keys `session:*` and `session:refresh:*`, and the sessions collection), because login tokens may have reached Google Analytics. Question for you: has any real (non-test) user signed in with Google on a public host? If yes, Arjun needs to know.

From Arjun, 12 Oct (10 minutes, in Google Analytics Admin; details in T-308): turn Google signals off; set data retention to 2 months; turn all data sharing off; in enhanced measurement turn off site search, form interactions and "page changes based on browser history events" (Kunal, T-306); check there are no Ads, BigQuery or Search Console links; confirm which Google account owns the property.

Release check (Ajay, T-308 condition 1): before release, record here that the founder confirmed the GA property settings above.

## Mailbox check (Mahak, T-268, 12 Oct)

Does the legal@lawie.in mailbox exist and get read? It is on Terms §14 and the Contact page. If not, tell Priya; both switch to contact@lawie.in.

## HTTPS check on develop (Arjun, T-319, 12 Oct)

Open the develop web app and confirm it loads on https:// with a padlock and no redirect loop. Google sign-in needs a secure address once T-319 merges. The real develop host config is not in the repo, so only you can check it. If it fails, tell Priya.

## Develop reseed before Anushka tests the converter (Ajay, T-280, 12 Oct)

Run the section seed with --force on develop (seed-sections) after T-280 merges and before Anushka tests the section converter, so the titles shown are Ajay's signed ones. This is the same develop-first reseed as item 5, so one run covers both.

## Overnight note (Priya, 12 Oct 2026)

- T-220 step 1 merged (b958216). Until your SES session, the email worker on develop will refuse to start, with one line naming the missing settings (INTERNAL_SECRET and AWS_SES_*): the develop server's production environment file is still SMTP-era. Arjun wants this visible failure; the SES session (item 2 above) fixes it. Nothing else depends on the worker yet.
