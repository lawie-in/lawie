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
6. **Status to the founder.** Priya sends one update per session or when he asks: per lead, the ticket, its step in the chain, and anything waiting on him. Escalations do not wait for it: a second failed review, a missing gate (Arjun, Ajay, Rajesh) or a founder-only decision goes from the lead to him directly, and the lead tells Priya.

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
