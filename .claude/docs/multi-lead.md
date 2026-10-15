# Five dev leads in parallel

Read by `vishal`, `mahak`, `shashank`, `kunal` and `tanvi` when a ticket starts, and by Priya when she assigns work. Founder decision, 11 Oct 2026: three leads, one coordinator (Priya), so tickets ship in parallel without colliding. Raised to five leads (`kunal`, `tanvi` added) by the founder, 12 Oct 2026.

## Who does what

| Role                                                   | Does                                                                                            | Never does                                                                                        |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Priya (coordinator)                                    | Assigns tickets, writes the claim record, orders merges, sends the founder one status update    | Writes code, commits, runs the crew                                                               |
| Lead (`vishal`, `mahak`, `shashank`, `kunal`, `tanvi`) | Runs one ticket through the crew, commits, merges into `develop_staging` in its slot and pushes | Takes an unassigned ticket, holds two tickets, changes files outside its claim                    |
| Crew (`developer`, `tester`, `reviewer`, `doc-writer`) | Shared by all five leads. One step each, as before                                              | Talk to the founder, commit, or look past its handoff packet. It needs no idea which lead sent it |

## The claim record

One file: `handoff/tickets/leads.md`, on `develop_staging`. Priya is its only writer. Leads read the latest copy from `origin/develop_staging` with `git show`, never from their own branch, which may be stale.

```markdown
## Claims

| Lead     | Ticket | Branch                    | Files and folders claimed                   | Legal paths                           | Since        |
| -------- | ------ | ------------------------- | ------------------------------------------- | ------------------------------------- | ------------ |
| vishal   | T-135  | fix/t-135-bail-provisions | apps/drafting/src/services/brief-drafter.ts | yes: brief-drafter.ts (Ajay ref: ...) | 11 Oct 10:40 |
| mahak    | T-138  | fix/t-138-phone-width     | apps/web/src/app/drafts/                    | no                                    | 11 Oct 10:45 |
| shashank | none   |                           |                                             |                                       |              |

## Merge queue

1. mahak — T-138 (ready 11 Oct 14:10)
2. vishal — T-135 (ready 11 Oct 14:30)
```

Each ticket file also gets one more row in its field table: `Assigned lead | <name>`. The claim record is what leads check; the ticket field is for anyone reading the ticket.

## Rules

1. **Assign.** Priya assigns a ticket only to a lead with no row, and only if its files and legal paths don't overlap any other row. Overlap means the same file, a parent folder of it, or the same legal-content path. `packages/shared` and root config (`package.json`, `yarn.lock`, `tsconfig*`, `.github/`) go to one lead at a time. Two tickets that need the same files run one after the other, not side by side.
2. **Claim first, commit right away.** A claim counts once it is on `origin/develop_staging`. The assigned lead commits Priya's change to `leads.md` straight onto `develop_staging` (`docs(tickets): assign t-nnn to <lead>`) and pushes before branching. Two claims reaching it at once: the second push fails, Priya re-checks and re-assigns.
3. **Extend.** After `Explore`, or when a developer report lists a file outside the claim, the lead stops and asks Priya. She extends the row if no other row holds that path; otherwise the lead waits or the ticket is split.
4. **Merge order.** First ready, first merged, unless Priya says otherwise and gives the reason (e.g. a smaller change goes first so the larger one rebases once). One lead merges at a time. The lead in the slot pulls the latest `develop_staging`, resolves its own conflicts, re-runs `build` and `test` for its workspaces and for any workspace the merge changed, then merges and pushes. Red after the merge: no push.
5. **Release.** After the push, Priya removes the row, moves the queue up and sets the ticket's Status line. The lead commits that change.
6. **Status to the founder.** Priya sends one update per session or when he asks: per lead, the ticket, its step in the chain, and anything waiting on him. Escalations do not wait for it: a second failed review, a missing gate (Arjun, Ajay, Rajesh) or a founder-only decision goes from the lead to him directly, and the lead tells Priya. Priya also posts the update to the relay as a `note` to `@founder`. Merging `develop_staging` into `develop` or `main` is the founder's alone, on his own timing: never ask him to merge, never remind him, and never list it as waiting on him (founder, 11 Oct 2026).

## The board, comments and the relay

Six sessions run apart: the whole team (Priya leads), `vishal`, `mahak`, `shashank`, `kunal` and `tanvi`. None can see another's conversation. The Lawie board artifact (https://claude.ai/artifact/REAV9qDo6bzJitD1TfxDXD), its comments, its relay and `leads.md` are how they talk.

**What the board holds.**

- `tickets/<id>`: status (`todo`, `doing`, `review`, `blocked`, `hold`, `done`, `closed`), title, owner, assignee (`vishal`, `mahak`, `shashank`, `kunal` or `tanvi`), files (claimed paths), note, deps, phase, file, updatedAt. The board flags two tickets claiming the same path, and marks hot paths: `packages/shared`, `apps/gateway`, `apps/drafting/src/config`, `docs/templates`, `ai.service.ts`, `preflight.service.ts`.
- `comments/<ticketId>`: one thread per ticket. Each item has from, body, ts.
- `messages/<YYYY-MM-DD>_<author>`: the relay chat, one document per author per day. Each item has from, to, kind, ticket, body, ts.

**Who writes what.**

- `leads.md` on `origin/develop_staging` stays the binding claim record, and Priya is still its only writer. The board mirrors it.
- Priya sets status, assignee and files on the board when she assigns or releases a ticket. Keep the board's files equal to the `leads.md` claim, or the clash flag means nothing.
- A lead updates only its own ticket's status: `doing` to `review` once merged into `develop_staging`, or `blocked` with the reason in the note. Leads never touch the Status line in ticket files.
- Write with the `ArtifactData` tool and pin every write with `if_version`. If it fails, re-read and redo the change. Never overwrite someone else's change.

**Ticket comments.** Workflow context only: the step reached in the chain, review round results, gates waiting, and decisions with who made them. No code, no secrets, no personal data, no document content.

**The relay.** For messages between sessions. Kinds: `note`; `claim` (a lead asking Priya for a file or an extension); `conflict` (two tickets touching the same path); `resolution` (Priya's answer). Every session reads the relay and its own tickets' comments at start, before branching and before merging into `develop_staging`.

**@mentions.** Address people with `@name` from the roster only: priya, vishal, mahak, shashank, kunal, tanvi, arjun, meera, vikram, ajay, rita, madhuri, rajesh, annu, kavya, anushka, mohan, founder. (Mohan: Finance Associate, billing and unit economics, added 14 Oct 2026 per Vikram, founder-approved. He reports to and takes instructions only from Vikram; read-only on Razorpay, no code, no pricing calls. Send finance asks to Vikram, not to Mohan.) Use `@founder` for anything only he decides. Tagging someone does not grant a gate: Ajay, Arjun and Rajesh sign-offs still need a reference.

## Worktrees

One persistent worktree per lead, outside the main checkout. The founder sets each up once:

```bash
git -C /home/user/lawie fetch origin
git -C /home/user/lawie worktree add --detach /home/user/lawie-wt/mahak origin/develop_staging
cd /home/user/lawie-wt/mahak && yarn install
```

Same for `shashank`, `kunal` and `tanvi` (and `vishal`, if he moves off his current checkout). Per ticket, the lead creates its branch inside its own worktree from `origin/develop_staging`.

- Start each lead's session from inside its worktree. Subagents run in the session's directory, so this is what keeps each crew on its own lead's files.
- Run `yarn install` in each worktree. Do not symlink `node_modules` from another checkout: its `@lawie/*` links resolve to that checkout's `apps/` and `packages/shared`, so a build in the worktree would test the wrong code.
- Gitignored files such as `.env` are not in a new worktree. Whether to copy them in (`.worktreeinclude`) is Arjun's call. Unit tests do not need them: each service's `setupEnv.ts` sets placeholders and uses an in-memory Mongo.
- Hooks in `.claude/hooks/` run only once the founder has accepted the workspace-trust prompt for that folder. Accept it on the first start of each worktree.

## What stays the same

Entry gate, modes, handoff packets, the review loop with its two-round cap, scope boundaries, the quality line in `.claude/docs/quality-gate.md`, and the rule that only the lead commits. Leads still cannot `Edit` or `Write`.

## Speed rules (founder, 12 Oct 2026)

The founder finds the chain too slow. Test enough to be safe, not more:

1. **Developer:** run `tsc` and only the test files for what you changed (`yarn workspace @lawie/<name> test -- <paths>`). No full suite.
2. **Tester:** write tests for the acceptance criteria only. Run them plus the existing tests for the touched files. Run the full workspace suite **once**, right before the merge. No extra property sweeps, mutation checks or repeat runs unless the ticket is legal content.
3. **Reviewer:** one pass. Only must-fix findings block. Should-fix and nice-to-have go into a follow-up ticket (tell Priya), not another round.
4. **Small-fix mode** (developer, tester, merge) for any ticket that stays in one service and touches no legal path, auth, billing or `packages/shared`, even if it is a small feature. The reviewer runs only for those four.
5. **Doc-writer** only when a doc outside `handoff/` is made wrong. Otherwise skip it and say so in the merge body.
6. **Merge re-runs:** after merging `origin/develop_staging` into your branch, re-run only the workspaces your own diff touches, plus builds. Workspaces changed only by others' already-merged work are covered by CI after your push.
7. **Stacking:** while your finished ticket waits in the merge queue, you may start your next ticket on a branch cut from it, if Priya writes both in your row as "T-a then T-b". T-b merges only after T-a.
8. Unchanged: Ajay's sign-off on legal diffs, golden snapshot rules, never skip or weaken a test, CI green after every push.

## Founder away: Priya decides (founder, 11 Oct 2026, night)

Until the founder's morning report, nobody asks the founder anything or tags him for approval, on the board or in a session.

- Every approval or decision that would go to the founder goes to Priya on the relay instead. That includes the second failed review, scope calls and order of work. Priya decides on the founder's delegation and logs it in the ticket.
- Gates that belong to Ajay, Arjun or Rajesh still come from them, and Priya gets them.
- Anything that physically needs the founder (his AWS, DNS, GitHub settings, the database, prod, merging to `develop` or `main`) goes on Priya's list for the morning report. The lead skips it and takes other work. Nobody waits on him.
- **Permission popups (founder, 11 Oct 2026, night):** wait at most 5 minutes for the founder to approve. Then stop waiting, post it to Priya on the relay and take other work. If Priya agrees it needs him, it goes on the morning list. Nobody holds the merge queue for a popup: if the lead in the slot has not moved within 15 minutes, Priya gives the slot to the next lead.
- **Relay times (founder, 11 Oct 2026, night):** the `ts` on every relay post or ticket comment is the real time from `date -u +%Y-%m-%dT%H:%M:%S.000Z`, pasted as is. Never type a time by hand. The board shows it in the reader's local time (IST for the founder).
- **No `cd` before git (founder, 11 Oct 2026, night):** a command that changes directory and then runs git always asks for permission, whatever the allow rules say. Use `git -C /home/user/lawie-wt/<lead> <subcommand>` with absolute paths, one command per call, and no `&&` chains or pipes around `git commit`, `merge` or `push`. Leads put this in every crew handoff packet.

## Merge slot v2 — the slot is the push, not the CI wait (Arjun, 14 Oct 2026, 21:20 UTC; founder: "resolve ASAP")

**Why.** The last 12 pushes to `develop_staging` were all green and each CI run takes 8–13 minutes. The queue made every lead wait for the previous lead's CI, then run the full local suite, then push: 25–35 minutes per merge, five leads, so most of the day was spent waiting on green runs. Of the 23 merge commits in the last 24 hours, 15 were `git pull` noise ("Merge branch 'develop_staging' of … into develop_staging"), each starting a CI run of its own.

**Rules, effective now. Where they differ from section 4 above, these win.**

1. **A slot ends when the push lands, not when CI is green.** Priya hands the next slot the moment the previous lead reports "pushed <sha>". Nobody waits for another lead's CI.
2. **CI runs on every lead branch.** `ci.yml` `on.push.branches` gains `feature/**` and `fix/**` (same `paths-ignore`, same per-ref concurrency). "Ready to merge" means: your branch tip includes `origin/develop_staging` from within the last hour **and** CI on that tip is green. That green run is the proof the merge will be green; the slot only has to repeat it when the merge brings in new code.
3. **In the slot:** `git fetch origin`; merge `origin/develop_staging` into your branch; if the merge brought code into a workspace you touched or into `packages/shared`, run that workspace's `build` and its **targeted** tests (the ticket's test files), not the full suite — CI runs the full suite on `develop_staging`; `git merge --no-ff` into `develop_staging`; push; report the sha. Target: under 10 minutes.
4. **Red `develop_staging` after this.** Per-ref concurrency means a later push can cancel an earlier run; the newest run covers both. If it is red: the lead whose workspace failed fixes it; if two leads merged inside one run window and both touched that workspace, the later one bisects first by re-running CI on their own branch tip (`workflow_dispatch`). The rule "never push a merge on top of a red `develop_staging` other than the fix" stands.
5. **No `git pull` noise.** Before any merge: `git fetch origin` then `git merge --ff-only origin/develop_staging` on your local `develop_staging`. A "Merge branch 'develop_staging' of …" commit means someone ran `git pull` on a diverged branch; it costs a CI run and a queue slot. Leads put `--ff-only` in every crew packet.
6. **Priya's queue stays first-ready-first-merged**, but she may hand two slots back to back the instant the first push lands, and she does not hold a slot for a lead whose branch CI is not green.

**One small fix to make rule 2 true:** add the two branch globs to `ci.yml` (10 minutes, CI file = root config claim, next free lead, small-fix mode). Until it merges, rule 2's "CI green on the tip" is satisfied by the lead's own targeted tests + build on the merged tip, as today.

### v2 safety addendum — no code is lost to speed (Arjun, 14 Oct 2026, 21:45 UTC; founder's concern)

Two merges never happen "at the same time". Git itself prevents it and the rules make it explicit:

1. **Still one lead in the slot.** v2 removed the wait for another lead's CI, not the slot. Priya hands the slot to one lead; the next starts only after "pushed <sha>".
2. **Git refuses a lost update.** A push to `develop_staging` is rejected ("fetch first") if the remote moved since the lead fetched. The lead then fetches, merges again, re-runs the targeted tests and pushes again. Nothing is overwritten.
3. **Never `--force`, never `--force-with-lease`, never delete `develop_staging`.** Not by a lead, not by the crew, not by me. The founder sets GitHub branch protection on `develop_staging`: "Block force pushes" and "Restrict deletions" (one minute, Settings → Branches). That makes rule 3 a wall, not a rule.
4. **Conflicts are the only place code can go missing, and claims make them rare.** No two claims hold the same file, so a merge conflict can only come from a shared file outside a claim. The rule stands: a conflict in a file outside your claim → stop, ask Priya; never resolve another lead's work. Resolving your own conflict keeps both sides unless the ticket says otherwise.
5. **After the push, verify the chain.** The lead runs `git log --oneline --merges -3 origin/develop_staging` and confirms the previous lead's merge commit is still the parent of theirs. If it is not, say so to Priya at once — nothing else is pushed until it is understood.
6. **Merge commits are `--no-ff`**, so every ticket stays one revertable commit; a bad merge is reverted with `git revert -m 1 <sha>`, never rewritten.

### v2 rule 7 — when a slot does wait for CI (founder, 14 Oct 2026, 21:50 UTC; written by Arjun)

Founder: "if it is a small fix don't wait for CI. Decide according to the commit whether to wait or not. In most cases, don't wait." So the default is rule 1 (slot ends on push). Priya holds the next slot until the run is green **only** when the merge just pushed touched one of: `.github/workflows/**`, `packages/shared/**`, root config (`package.json`, `yarn.lock`, `tsconfig*`, `jest.config*`, Dockerfiles, `docker-compose*`), or a backfill / migration script. Those are the changes whose failure would hide or break every later run. Everything else — a service fix, a pack, a web change, docs — never waits. The T-439b hold (CI workflow change) is this rule applied; after run 548 is green, normal v2.

### v2 rule 8 — a red run already on your branch is a stop sign (Arjun, 15 Oct 2026, 03:10 UTC)

Rule 1 says you do not _wait_ for CI before leaving the slot. It does not say you may ignore a CI run that has already finished. CI runs on every push to `feature/**` and `fix/**` (T-439). So, before `git merge` into `develop_staging`: look at the last **completed** run on your branch (`mcp__github__actions_list`, `list_workflow_runs`, branch = your branch). Red → you do not merge; fix it on the branch first (through `developer` + `tester`, a fresh `reviewer` if source changed). Still running or green → merge as rule 1 says. A run that was cancelled by your own later push does not count either way; look at the one before it. Why: run 613 on `feature/t-245a-old-law-switch` had already failed on the golden dry run (fixture 22) five minutes before the branch was merged as run 617, which turned `develop_staging` red for everyone. The cost of the look is one API call; the cost of skipping it was an hour of held queue.

Waiver (Arjun, 15 Oct 2026, 03:30 UTC): a red run caused by a failure already confirmed to hit every branch (not your change) may be waived for one ticket, by Arjun, in writing in the ticket; the merge commit names the waiver. Nobody waives their own. First case: `t428-bail-case-lines` reading `origin/develop_staging` in branch CI (tests never read git refs or the remote for a baseline; fix is a committed snapshot, Shashank), waived for T-438 only.

Waiver extended (Arjun, 15 Oct 2026, 05:00 UTC): the same `t428-bail-case-lines` artifact also hits T-441 (run 629) and T-431 (run 623); waived for those two on the same conditions. The fixture fix (Shashank, Priya's GO) closes the class; once it is on `develop_staging`, a lead merges it into their branch and lets branch CI go green instead of using the waiver.

## Drafting v2 branch (founder, 15 Oct 2026)

`develop_staging_v2` exists on origin (cut from `develop_staging` at bafe88d3) for ADR-026 work: tickets T-458 to T-467 and every later v2 ticket. Rules:

1. v2 ticket branches are cut from and merged (`--no-ff`) into `develop_staging_v2`; v1 tickets stay on `develop_staging`. Never cross the two.
2. Only the founder merges `develop_staging_v2` into anything, on his timing; nobody opens a PR from it.
3. Priya keeps a second merge queue for `develop_staging_v2` in `leads.md` once v2 starts (after T-403). The one-ticket-per-lead and file-claim rules are unchanged and apply across both branches: a lead holds one ticket, on one branch.
4. Arjun refreshes `develop_staging_v2` from `develop_staging` (merge, never rebase) when v1 lands something v2 needs; he announces the merge in the relay.
5. CI runs on push to `develop_staging_v2` the same as `develop_staging` (workflow change ticketed with T-462's CI work; until then, the branch run on the ticket branch is the gate).

## No `cd` in commands (founder, standing since about 13 Oct 2026, written down 15 Oct 2026)

Never put `cd` in a Bash command, least of all in git or commit commands. A command that starts with `cd` is blocked and the permission prompt lands on the founder. Run git from anywhere with `git -C <worktree> <cmd>`, and run tools with their own path flags (for example `yarn --cwd <worktree> ...`). The same goes for every crew subagent. A prompt reaching the founder because of this is a lead's mistake, not his job. Priya reminds a lead once and notes repeats in the relay.
