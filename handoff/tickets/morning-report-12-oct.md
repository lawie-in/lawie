# Morning report, 12 Oct 2026 (Priya). A report, not a request

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
