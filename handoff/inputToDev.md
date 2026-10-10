# Input to Vishal (the VS Code session)

Written by Priya, 6 Oct 2026, 10:4x. Updated 15:5x. Read this first, then `handoff/tickets/README.md`, section "Where we are".

The war-room chat built T-124 (PR #38), T-122 step 2 (PR #39) and T-105 (PR #40) today. All three are merged. T-106 part 1 (PR #41) and T-130 (PR #43) are merged too. Do not build those again.

## New rule, 6 Oct 2026, 17:1x: the quality gate

The founder has added Anushka, Chief Quality Officer. No pull request into `develop` or `main` is merged without her verdict. You never invoke her and never write her verdict. End every PR body with `Quality: waiting for Anushka`, or for a change no user can see, `Quality: nothing to test in the UI — <reason>`. Add a section "What a user can now do", in a user's words. The full rule is `.claude/docs/quality-gate.md` once PR #48 is merged; restart the session after pulling it.

New tickets from the founder's own test: `T-133` (remove the Bihar police link and anything else tied to one state) and `T-134` (ask the user which document instead of guessing). Do not start either until Priya says so.

## Do now, in this order

1. `git fetch`, then open a pull request for `fix/seed-sections-repealed-type` into `develop`. It is pushed and has none.
2. `T-122`, step 1. It needs the database, which only this machine can reach.
3. `T-122`, step 4, the part that needs the model: on `develop` with PR #39 in it, run the founder's sentence 20 times through `POST /intake` in dev and write in the ticket what came back each time. About 20 Haiku calls. Ask the founder before spending.
4. ~~`T-130`~~ Done from the chat: PR #43. The causes are in the ticket. Do not work on it.

Stop after each one and report what you ran and what you did not run.

Do not start `T-106`. Both parts are merged (PR #41 and PR #44). `T-125` (web) is PR #45, from the chat session. Do not build it again.

PR #45 is merged (15:28). The founder asked the chat session to run `handoff/manual-checks/T-125-e2e-plan.md` in the browser pane (15:35). It has not started: the backend was not running on this machine and the founder was not signed in. If the founder asks you instead, write each result under its step. It needs `seed:all` first.

`T-131` (landing page) is PR #46, from the chat session. Do not build it again. On the web, never join a class name to `${...}` without a space inside a template literal: the Prettier Tailwind plugin trims it on commit.

Also run `yarn workspace @lawie/drafting seed:all` once the founder says so: the courts list is empty in the database, and without it every court document is refused.

## Answer these two in your first report

1. Is the production "coming soon" change committed? It is not in `main` or `develop`. If it only exists on the server, commit it on a branch and open a pull request.
2. Was the production `INTERNAL_SECRET` rotated (`T-117`)? Answer yes or no. Do not print the value anywhere.

## Repo state when this was written

- This working copy is on `fix/seed-sections-repealed-type`, one commit ahead of an old `develop`.
- `develop` on GitHub is at `58100f0` (PR #44 merged). `main` is behind `develop`.
- Two local edits are not committed: `.gitignore` and `handoff/design/T-003-token-usage-design.md`. Leave them alone.

---

## Priya, 10 Oct 2026, 04:4x — this section supersedes the "Do now" list above

The founder approved ADR-022 on 9 Oct. T-147 is split into five tickets. **Work them in order, one at a time, a pull request each before starting the next.**

1. `T-147a` — Fact Ledger schema and the Indian/Hinglish normalizer. Ready, cut from `develop`. Headless, no Ajay gate.
2. `T-147b` — Reception writes the ledger, the brief renders from it. **Ajay gates the `intake.prompts.ts` diff.**
3. `T-147c` — the Drafter may use only the ledger. **Two Ajay gates:** the `drafter.prompts.ts` diff, and the averment allowlist for each of the 5 seeded packs.
4. `T-147d` — the verifier. **This is the go-live gate.**
5. `T-147e` — the golden set against the real model.

Then `T-118` (call Anthropic directly, remove Helicone). Step 1 only — empty the Helicone key and redeploy. Step 3 is the founder's. T-118 has moved up because T-004 cannot produce a trustworthy cost per draft while calls still route through Helicone.

Read before you start: `docs/adr/ADR-022-fact-ledger-and-draft-verification.md`. It is on this machine but **not in git** (`.gitignore` ignores `docs/`), so it will not be in a fresh clone. Everything you need to build is restated inside each ticket file, so the ticket is enough if the ADR is missing.

### Rules that still apply

- The quality gate stands, in the 7 Oct form: Anushka tests on `develop` and gives the go-live signal. Finish development first and say when a ticket is ready for her. Do not invoke her and do not write her verdict.
- The founder's 7 Oct rule: you work in a Claude Code session, not in the war-room chat.
- Keep the founder updated as you go. He raised on 7 Oct that 3.5 hours passed without him knowing what the dev team was doing.
- Do not touch S3, PDF ingestion or any retrieval index. The founder proposed a PDF law-book corpus as the T-147 fix on 9 Oct; Arjun and Ajay rejected it and he dropped it. It is deferred to Phase 2 as statute-only. ADR-022 section 5.1 records why. Building it is out of scope for every T-147 ticket.

### Still open from the list above

Both of these are unanswered and still needed:

1. Is the production "coming soon" change committed? It is not in `main` or `develop`.
2. Was the production `INTERNAL_SECRET` rotated (`T-117`)? Yes or no. Do not print the value.

---

## Priya, 10 Oct 2026 — both open questions answered by the founder

1. **Production "coming soon": answered. Not a gap.** It is deliberate and applies to production only. It is never committed anywhere. The founder switched the dashboard off on production so nobody uses it early. Do not commit it and do not open a pull request for it.
2. **`INTERNAL_SECRET` (T-117): answered. Not rotated.** The founder says it does not matter: every environment today is a dev environment, and a fresh production environment is created at launch. T-117 is closed. The new-secrets step is now a T-403 checklist item (`INTERNAL_SECRET`, JWT secrets, Anthropic API key, Razorpay, database credentials).

Also from today:

- **T-118 Step 3 is skipped.** The founder does not have the email for the Helicone account. The code no longer calls Helicone (PR #82), and he verified drafting works without the key. The Records item (Arjun) stays open.
- **New: T-187.** Ajay's DPDP condition: a retention and deletion rule for the Fact Ledger and the `intake_extract` rows before `feature.fact_ledger` goes on for real users. Arjun and Ajay write the rule first. Do not build it until they have.
