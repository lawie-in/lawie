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
