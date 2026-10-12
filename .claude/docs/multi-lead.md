# Three dev leads in parallel

Read by `vishal`, `mahak` and `shashank` when a ticket starts, and by Priya when she assigns work. Founder decision, 11 Oct 2026: three leads, one coordinator (Priya), so tickets ship in parallel without colliding.

## Who does what

| Role | Does | Never does |
|---|---|---|
| Priya (coordinator) | Assigns tickets, writes the claim record, orders merges, sends the founder one status update | Writes code, commits, runs the crew |
| Lead (`vishal`, `mahak`, `shashank`) | Runs one ticket through the crew, commits, merges into `develop_staging` in its slot and pushes | Takes an unassigned ticket, holds two tickets, changes files outside its claim |
| Crew (`developer`, `tester`, `reviewer`, `doc-writer`) | Shared by all three leads. One step each, as before | Talk to the founder, commit, or look past its handoff packet. It needs no idea which lead sent it |

## The claim record

One file: `handoff/tickets/leads.md`, on `develop_staging`. Priya is its only writer. Leads read the latest copy from `origin/develop_staging` with `git show`, never from their own branch, which may be stale.

```markdown
## Claims

| Lead | Ticket | Branch | Files and folders claimed | Legal paths | Since |
|---|---|---|---|---|---|
| vishal | T-135 | fix/t-135-bail-provisions | apps/drafting/src/services/brief-drafter.ts | yes: brief-drafter.ts (Ajay ref: ...) | 11 Oct 10:40 |
| mahak | T-138 | fix/t-138-phone-width | apps/web/src/app/drafts/ | no | 11 Oct 10:45 |
| shashank | none | | | | |

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

Four sessions run apart: the whole team (Priya leads), `vishal`, `mahak` and `shashank`. None can see another's conversation. The Lawie board artifact (https://claude.ai/artifact/REAV9qDo6bzJitD1TfxDXD), its comments, its relay and `leads.md` are how they talk.

**What the board holds.**

- `tickets/<id>`: status (`todo`, `doing`, `review`, `blocked`, `hold`, `done`, `closed`), title, owner, assignee (`vishal`, `mahak` or `shashank`), files (claimed paths), note, deps, phase, file, updatedAt. The board flags two tickets claiming the same path, and marks hot paths: `packages/shared`, `apps/gateway`, `apps/drafting/src/config`, `docs/templates`, `ai.service.ts`, `preflight.service.ts`.
- `comments/<ticketId>`: one thread per ticket. Each item has from, body, ts.
- `messages/<YYYY-MM-DD>_<author>`: the relay chat, one document per author per day. Each item has from, to, kind, ticket, body, ts.

**Who writes what.**

- `leads.md` on `origin/develop_staging` stays the binding claim record, and Priya is still its only writer. The board mirrors it.
- Priya sets status, assignee and files on the board when she assigns or releases a ticket. Keep the board's files equal to the `leads.md` claim, or the clash flag means nothing.
- A lead updates only its own ticket's status: `doing` to `review` once merged into `develop_staging`, or `blocked` with the reason in the note. Leads never touch the Status line in ticket files.
- Write with the `ArtifactData` tool and pin every write with `if_version`. If it fails, re-read and redo the change. Never overwrite someone else's change.

**Ticket comments.** Workflow context only: the step reached in the chain, review round results, gates waiting, and decisions with who made them. No code, no secrets, no personal data, no document content.

**The relay.** For messages between sessions. Kinds: `note`; `claim` (a lead asking Priya for a file or an extension); `conflict` (two tickets touching the same path); `resolution` (Priya's answer). Every session reads the relay and its own tickets' comments at start, before branching and before merging into `develop_staging`.

**@mentions.** Address people with `@name` from the roster only: priya, vishal, mahak, shashank, arjun, meera, vikram, ajay, rita, madhuri, rajesh, annu, kavya, anushka, founder. Use `@founder` for anything only he decides. Tagging someone does not grant a gate: Ajay, Arjun and Rajesh sign-offs still need a reference.

## Worktrees

One persistent worktree per lead, outside the main checkout. The founder sets each up once:

```bash
git -C /home/user/lawie fetch origin
git -C /home/user/lawie worktree add --detach /home/user/lawie-wt/mahak origin/develop_staging
cd /home/user/lawie-wt/mahak && yarn install
```

Same for `shashank` (and `vishal`, if he moves off his current checkout). Per ticket, the lead creates its branch inside its own worktree from `origin/develop_staging`.

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
6. Unchanged: Ajay's sign-off on legal diffs, golden snapshot rules, never skip or weaken a test, CI green after every push.

## Founder away: Priya decides (founder, 11 Oct 2026, night)

Until the founder's morning report, nobody asks the founder anything or tags him for approval, on the board or in a session.

- Every approval or decision that would go to the founder goes to Priya on the relay instead. That includes the second failed review, scope calls and order of work. Priya decides on the founder's delegation and logs it in the ticket.
- Gates that belong to Ajay, Arjun or Rajesh still come from them, and Priya gets them.
- Anything that physically needs the founder (his AWS, DNS, GitHub settings, the database, prod, merging to `develop` or `main`) goes on Priya's list for the morning report. The lead skips it and takes other work. Nobody waits on him.
- **Permission popups (founder, 11 Oct 2026, night):** wait at most 5 minutes for the founder to approve. Then stop waiting, post it to Priya on the relay and take other work. If Priya agrees it needs him, it goes on the morning list. Nobody holds the merge queue for a popup: if the lead in the slot has not moved within 15 minutes, Priya gives the slot to the next lead.
- **Relay times (founder, 11 Oct 2026, night):** the `ts` on every relay post or ticket comment is the real time from `date -u +%Y-%m-%dT%H:%M:%S.000Z`, pasted as is. Never type a time by hand. The board shows it in the reader's local time (IST for the founder).
- **No `cd` before git (founder, 11 Oct 2026, night):** a command that changes directory and then runs git always asks for permission, whatever the allow rules say. Use `git -C /home/user/lawie-wt/<lead> <subcommand>` with absolute paths, one command per call, and no `&&` chains or pipes around `git commit`, `merge` or `push`. Leads put this in every crew handoff packet.

