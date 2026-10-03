# Lawie dev crew: build spec for Vishal

- **Date:** 3 Oct 2026
- **From:** war room with the founder, Rita (HR) and Arjun (CTO)
- **For:** Vishal, to design and write the dev agents in this repo
- **Status:** crew and flow approved by the founder. Section 9 lists what is still open.

Terms used below. The **crew** is the set of dev agents that live in this repo. The **lead** is Vishal's own session, which dispatches the crew. A **handoff packet** is the message the lead sends a crew agent when it delegates, and a **report** is the fixed-format message the agent sends back.

Everything marked _proposed_ is a starting point for you to adjust. Everything in sections 1, 2 and 8 is either a founder decision or a fact checked against the repo or the Claude Code docs on 3 Oct.

---

## 1. Decisions already made

1. The dev crew lives in this repo under `.claude/`. The role team (Arjun, Priya, Meera, Madhuri, Rajesh, Ajay, Vikram, Rita, Kavya) stays in the Cowork `lawie-team` plugin, unchanged.
2. Two tiers. Roles own decisions and talk to the founder. Crew agents do one step each, own no decisions, and never talk to the founder. Only the lead does.
3. Four new crew agents: `developer`, `tester`, `reviewer`, `doc-writer`. No others.
4. Exploration uses Claude Code's built-in `Explore` agent. Do not write an explorer.
5. There is no designer agent in the repo. Design comes from Rajesh in Cowork as a Figma link plus handoff spec inside the ticket.
6. One Vishal. The model is set per agent file, so the old Vishal-Opus / Vishal-Sonnet split is gone.
7. Flow: lead → Explore → developer → tester → reviewer → doc-writer → PR. Deploy is Nikhil's and is outside this spec.
8. If the reviewer fails the change it goes back to the developer. Maximum two loops, then it goes to the founder.
9. Full chain for feature tickets. Small fixes use developer + tester only.
10. Each step refuses work that lacks the previous step's output (gates, section 5).

**One correction to what was said in the meeting.** The developer was described as working in "its own worktree". Drop that for now. A subagent worktree branches from the remote default branch (`main` here), not `develop`, and the tester and reviewer would not see changes sitting in another worktree. The chain is sequential, so nothing collides in one checkout. Worktrees become useful only when two tickets run in parallel (section 8).

---

## 2. Fix these before writing any agent

Found in the repo on 3 Oct. The first one silently defeats the whole plan.

| #   | Problem                                                                                                                                                                                                                                                                          | Fix                                                                                             |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1   | `.gitignore` line 64 ignores all of `.claude/`. Agent files written there will never be committed, and `git status` will not show them.                                                                                                                                          | Replace the `.claude/` line with the block below.                                               |
| 2   | `.claude/settings.local.json` is tracked in git (added before the ignore rule) and holds machine paths from the old Mac (`/Users/abhinavanand/Files/Lawie`).                                                                                                                     | `git rm --cached .claude/settings.local.json`                                                   |
| 3   | `.claude/launch.json` is tracked, points at the same old path and at `apps/api`, which no longer exists.                                                                                                                                                                         | Fix or delete.                                                                                  |
| 4   | There is no `CLAUDE.md` anywhere in the repo. Crew agents get only their own prompt plus `CLAUDE.md`, so without it every agent file has to repeat the repo conventions.                                                                                                         | Add a root `CLAUDE.md` holding section 7. See open decision 5.                                  |
| 5   | `docs/` is gitignored. Existing files in it stay tracked, but any new file the doc-writer adds there will not be committed.                                                                                                                                                      | Decide where new docs go, or narrow the ignore rule.                                            |
| 6   | The checkout is on `fix/branding-assets`, 7 commits behind `develop`, with an uncommitted change.                                                                                                                                                                                | Start crew work from an up-to-date `develop`.                                                   |
| 7   | The 7 Aug framework doc says `.claude/agents`, six skills, `.claude/settings.json` and `scripts/build-plugin.sh` are committed. None of them exist on any branch here, local or remote. The installed plugin is v0.2.0 with 10 agents and one skill, not v0.3.0 with 11 and six. | Ask the founder whether that work is unpushed on the other machine before recreating any of it. |

`.gitignore` replacement for the `.claude/` line. Git cannot re-include a file whose parent directory is ignored, which is why the first line changes to `.claude/*`:

```gitignore
.claude/*
!.claude/agents/
!.claude/skills/
!.claude/hooks/
!.claude/settings.json
!.claude/DEV_TEAM_SPEC.md
.claude/worktrees/
```

---

## 3. Layout

```
CLAUDE.md                      repo conventions (section 7), loaded by the lead and every crew agent
.claude/
  settings.json                shared permissions and the default session agent (section 6)
  settings.local.json          personal, untracked
  agents/
    vishal.md                  the lead
    dev/
      developer.md
      tester.md
      reviewer.md
      doc-writer.md
  hooks/
    tests-only.sh
    no-tests.sh
    docs-only.sh
    readonly-bash.sh
  DEV_TEAM_SPEC.md             this file
```

Subfolders under `.claude/agents/` are fine: the directory is scanned recursively and an agent's identity is its `name` field, not its path.

---

## 4. The agents (proposed)

All crew agents share these rules, so put them in each prompt:

- You start with no memory of the conversation. Everything you need is in the handoff packet. If something is missing, stop and return `BLOCKED:` plus the question. You cannot ask the founder.
- Do one step. Do not do the next agent's job.
- End with the report format for your role and nothing after it.
- Say what you ran and what you did not run.

Keep each `description` to one line. Descriptions for all agents are loaded into every session, and the `<example>` blocks used in the plugin files are too long for that.

### 4.1 `vishal` (lead)

```yaml
---
name: vishal
description: Lawie dev lead. Takes one Jira ticket through the dev crew and opens the PR to develop.
model: opus
disallowedTools: Edit, Write, NotebookEdit
---
```

- Runs as the main session, not as a subagent (section 6 sets this).
- Cannot edit files, so code changes have to go through the developer. Bash can still write files, so this is a strong nudge and not a wall.
- Uses a denylist instead of a `tools` allowlist so that Jira and Notion connector tools stay available when they are connected.

Prompt must cover:

- Check the entry gate (section 5) before anything else. Refuse and say what is missing.
- Pick the mode: full chain or small fix (section 5).
- Create the branch from `develop`.
- Write the handoff packet for each step and pass earlier reports forward.
- Run the review loop, counting rounds. On a fail, resume the same developer so it keeps its context. Start a fresh reviewer each round so the review stays independent.
- Open the PR to `develop` with the four reports summarised.
- Scope boundaries carried over from the plugin briefing: no stack or architecture change without Arjun's ADR, no scope change without Priya, no UI change without Rajesh's design, no Anthropic API call without rate-limit and cost guards, no PII or document content in third-party logs.

### 4.2 `developer`

```yaml
---
name: developer
description: Implements one scoped code change from the lead's handoff packet. Does not write tests or docs.
model: opus
tools: Read, Edit, Write, Grep, Glob, Bash
maxTurns: 60
hooks:
  PreToolUse:
    - matcher: 'Edit|Write'
      hooks:
        - type: command
          command: '${CLAUDE_PROJECT_DIR}/.claude/hooks/no-tests.sh'
---
```

- Blocked from `__tests__/` and `__snapshots__/` by hook. This stops a developer from weakening a test to get it to pass.
- If an existing test encodes behaviour the ticket changes on purpose, it reports that and leaves the test for the tester.
- Runs typecheck and the existing tests for the touched workspace before reporting.

Report: `STATUS` (done / blocked), files changed, what each acceptance criterion maps to, commands run with results, existing tests that now need updating, anything out of scope it noticed.

### 4.3 `tester`

```yaml
---
name: tester
description: Writes and runs tests for a change the developer has reported. Edits test files only.
model: sonnet
tools: Read, Edit, Write, Grep, Glob, Bash
maxTurns: 40
hooks:
  PreToolUse:
    - matcher: 'Edit|Write'
      hooks:
        - type: command
          command: '${CLAUDE_PROJECT_DIR}/.claude/hooks/tests-only.sh'
---
```

- May edit only `**/__tests__/**` and `*.test.ts(x)`.
- Never changes source to make a test pass. A failing test caused by the source is a finding, not something to fix.
- Never runs `test:golden:update` or `--updateSnapshot`. The court-rules golden snapshots encode legal content. If a snapshot needs to change, it reports the diff and the lead decides.
- One test per acceptance criterion at minimum.

Report: `STATUS` (green / red / blocked), tests added, command and summary line of the run, failures with file and line, coverage for the touched workspace, criteria with no test and why.

### 4.4 `reviewer`

```yaml
---
name: reviewer
description: Read-only review of a tested change against its ticket. Returns pass or fail with findings.
model: opus
tools: Read, Grep, Glob, Bash
maxTurns: 25
hooks:
  PreToolUse:
    - matcher: 'Bash'
      hooks:
        - type: command
          command: '${CLAUDE_PROJECT_DIR}/.claude/hooks/readonly-bash.sh'
---
```

- No Edit or Write. Bash is limited by hook to read-only git commands (`git diff`, `log`, `show`, `status`, `blame`). Without the hook, Bash alone would let it write files, so the tools list is not enough on its own.
- Must not run `yarn lint`: every lint script in this repo is `eslint --fix` and rewrites files.
- Reviews the diff against the acceptance criteria, then for: correctness, missing error handling, auth and JWT handling, Razorpay webhook signature checks, secrets or PII in logs, unguarded Anthropic calls, changes that fall outside the ticket.

Report: `VERDICT` (pass / fail), then findings as must-fix / should-fix / note, each with file and line and a concrete fix. A fail needs at least one must-fix.

### 4.5 `doc-writer`

```yaml
---
name: doc-writer
description: Updates docs for a reviewed change and drafts the PR description and diary entry. Edits Markdown only.
model: sonnet
tools: Read, Edit, Write, Grep, Glob, Bash
maxTurns: 20
hooks:
  PreToolUse:
    - matcher: 'Edit|Write'
      hooks:
        - type: command
          command: '${CLAUDE_PROJECT_DIR}/.claude/hooks/docs-only.sh'
    - matcher: 'Bash'
      hooks:
        - type: command
          command: '${CLAUDE_PROJECT_DIR}/.claude/hooks/readonly-bash.sh'
---
```

- May edit only `*.md`.
- Updates `README.md`, `CLAUDE.md` and service docs only where the change made them wrong. No new docs for their own sake.
- Returns the PR description and the diary entry as text. The lead posts them.

Report: files changed, PR description, diary entry (what was done, what was tested, what is blocked, what is next).

### 4.6 Hook pattern

Hooks receive the tool call as JSON on stdin. Exit code 2 blocks the call and the message on stderr goes back to the agent. Sketch for `tests-only.sh`, untested, needs `jq`:

```bash
#!/bin/bash
FILE=$(jq -r '.tool_input.file_path // empty')
case "$FILE" in
  */__tests__/*|*.test.ts|*.test.tsx) exit 0 ;;
esac
echo "Blocked: tester may edit test files only ($FILE)" >&2
exit 2
```

`readonly-bash.sh` reads `.tool_input.command` and allows only the git read commands. Make the scripts executable. Hooks in agent files run only after the workspace trust prompt has been accepted for this folder.

---

## 5. Workflow and gates

**Handoff packet** (lead → every crew agent): ticket key, acceptance criteria copied in full, mode, branch, services and paths in scope, what is out of scope, design reference, ADR reference, legal sign-off reference, and the earlier reports for this ticket.

**Gates.** Each step refuses if its input is missing.

| Step                      | Refuses without                                                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| lead                      | Either a `SCRUM-n` key with acceptance criteria from Priya, or a `T-nnn` file in `handoff/tickets/` with acceptance criteria (local tickets, used while Jira and Notion are paused pre-v1 — see T-001) |
| lead, UI ticket           | Rajesh's Figma link and handoff spec                                                                                                                                                                   |
| lead, architecture change | Arjun's ADR reference                                                                                                                                                                                  |
| lead, legal content       | Ajay's sign-off reference                                                                                                                                                                              |
| developer                 | Handoff packet with acceptance criteria and branch                                                                                                                                                     |
| tester                    | Developer report with `STATUS: done` and the changed files                                                                                                                                             |
| reviewer                  | Tester report with `STATUS: green`                                                                                                                                                                     |
| doc-writer                | Reviewer `VERDICT: pass`                                                                                                                                                                               |
| PR                        | All four reports                                                                                                                                                                                       |

**Local ticket status.** A `T-nnn` ticket's Status line lives in its own file under `handoff/tickets/` and is the founder's to move — the lead has `Edit`/`Write` disallowed and none of the four crew agents touch that folder. The lead tells the founder what the Status line should become; the founder writes it.

**Legal content** means anything under `apps/drafting/src/config/` (`document-rules`, `court-rules`, `courts`, `sections`), `docs/templates/*.json`, the template seed scripts, and the prompts in `apps/drafting/src/services/ai.service.ts` and `preflight.service.ts`.

**Modes.**

| Mode       | Steps                                                     | When (proposed, Arjun to confirm)                                                                           |
| ---------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Full chain | Explore → developer → tester → reviewer → doc-writer → PR | Any feature. Any change touching auth, billing, legal content, `packages/shared`, or more than one service. |
| Small fix  | developer → tester → PR                                   | A bug in one service that touches none of the above.                                                        |

**Review loop.** Fail → developer (resumed) → tester → reviewer (fresh). After the second fail the lead stops and takes it to the founder with both sets of findings.

**End of chain.** PR to `develop`. CI runs there. Deployment is manual today: both deploy workflows are no-op placeholders.

---

## 6. Guardrails (`.claude/settings.json`, committed)

Arjun's rule from the framework doc applies: a prompt is not a security boundary. Anything that must not happen is blocked by a tool list, a hook or a permission rule.

```json
{
  "agent": "vishal",
  "permissions": {
    "deny": ["Read(./.env)", "Read(./.env.*)", "Read(./**/*.pem)"],
    "ask": ["Bash(git push *)", "Bash(gh pr merge *)", "Bash(gh workflow run *)"]
  }
}
```

- `"agent": "vishal"` makes every session in this repo start as the lead.
- Check the rule syntax against the permissions docs before committing. The `.env.*` rule also blocks the `.env.*.example` files, which is acceptable or can be loosened.
- Crew agents use a `tools` allowlist without `Agent`, so they cannot spawn subagents of their own.
- **Known gap:** real secrets sit in this checkout (`.env`, `.env.production`, `.env.demo`). A `Read` deny rule does not reliably stop `cat .env` through Bash. Open decision 6.
- The pre-commit secret scan is skipped when `gitleaks` is not installed. Check that it is.

---

## 7. Repo facts for `CLAUDE.md`

Checked on 3 Oct. These replace the stale facts listed at the end of this section.

| Topic        | Fact                                                                                                                                                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Layout       | Yarn workspaces monorepo. `apps/`: `gateway` (4000), `auth` (4001), `drafting` (4002), `billing` (4003), `email-worker`, `web` (3000). `packages/`: `shared`, `email-client`.                                                        |
| Stack        | Express 4 + Mongoose 8 services, Next.js 16 + React 19 + Tailwind 3 web, Redis via ioredis, `@anthropic-ai/sdk`, Razorpay, Pino, Sentry. Node 20 or later.                                                                           |
| Test         | `yarn workspace @lawie/<name> test`. Jest + ts-jest. Tests match `**/__tests__/**/*.test.ts`. Build `@lawie/shared` first, as CI does.                                                                                               |
| Coverage     | The base config says 70%, but each service overrides it. Lines: billing 70, gateway 70, auth 35, drafting 35. Branches: billing 65, gateway 15, auth 5, drafting 5. So a green run in auth or drafting proves little about coverage. |
| Test gaps    | `web` has zero tests and passes with none. `shared` has none. CI has jobs only for gateway, auth, drafting and billing, so `web`, `email-worker` and `email-client` are never run in CI.                                             |
| Golden tests | `apps/drafting` has court-rules snapshot tests. `test:golden:update` rewrites them.                                                                                                                                                  |
| Lint         | `yarn workspace @lawie/<name> lint` runs `eslint --fix` and edits files.                                                                                                                                                             |
| Typecheck    | `yarn workspace @lawie/<name> build` runs `tsc`.                                                                                                                                                                                     |
| Commits      | Conventional commits enforced by commitlint: type from the allowed list, lower-case subject, 100 characters max. Husky runs gitleaks and lint-staged on commit.                                                                      |
| Branches     | `feature/scrum-<n>-<slug>` or `fix/<slug>`, cut from `develop`. PR to `develop`. `main` is production.                                                                                                                               |
| Jira         | Project key `SCRUM`.                                                                                                                                                                                                                 |
| Remote       | `github.com/lawie-in/lawie`                                                                                                                                                                                                          |

Stale, do not copy:

- The plugin's Vishal briefing says Next.js 14 and a root `CLAUDE.md` diary. Priya's says Jira project `LAW`.
- `.github/copilot-instructions.md` describes a single `apps/api` on AWS ECS. That service no longer exists.
- `README.md` lists four services, leaves out `email-worker` and `email-client`, and gives the old clone URL.

Fixing the last two is a good first job for the doc-writer.

---

## 8. Claude Code rules that shape this design

From the Claude Code docs, read on 3 Oct. Run `claude --version` first: several of these need v2.1.2xx or later.

- Only `name` and `description` are required. Frontmatter must start on line 1. Field names are camelCase and a misspelt field is ignored with no error.
- A file with no `name`, no `description` or bad YAML is skipped silently. Run `claude plugin validate .claude/agents`, or start with `--debug`, to catch it.
- Creating `.claude/agents/` for the first time needs a session restart before the agents appear.
- A crew agent gets its own prompt, the handoff message, `CLAUDE.md` and a git status snapshot. It does not get the conversation, and it does not get the default Claude Code system prompt. The built-in `Explore` skips `CLAUDE.md` too.
- Subagents cannot use `AskUserQuestion`. Hence the `BLOCKED:` rule.
- `tools` is an allowlist and `disallowedTools` a denylist. An entry like `Bash(git push *)` in `disallowedTools` removes all of Bash, so command-level blocks belong in `permissions` or a hook.
- Plugin-packaged agents ignore `hooks`, `mcpServers` and `permissionMode`. This is why the crew has to be repo files and cannot be shipped through the Cowork plugin.
- Running an agent as the main session (`agent` setting or `claude --agent`) replaces the default Claude Code system prompt with the agent's body. See open decision 2.
- `model` accepts `opus`, `sonnet`, `haiku`, a full model ID or `inherit`.
- `maxTurns` caps a run. The values in section 4 are guesses to tune.
- Every subagent's requests count against the same usage limits as the main session.
- `Explore` runs on the main session's model. A project agent named `Explore` with `model: haiku` overrides the built-in if exploration cost becomes a problem.
- Worktrees, for later: set `worktree.baseRef` to `"head"` so a subagent worktree starts from the current branch, and add a `.worktreeinclude` file so gitignored files such as `.env` are copied in.
- Optional later: `memory: project` gives an agent a notes folder at `.claude/agent-memory/<name>/` that can be committed. Useful for the reviewer's recurring findings.

---

## 9. Open decisions

| #   | Decision                                                                                                                                                                                                                                                             | Owner   | Recommendation                                                                   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------- |
| 1   | Where dev handoffs live (`inputToDev`, `followUp`, Vishal Diary): repo or Notion. `.gitignore` currently ignores `followUp.md` and `docs/CLAUDE.md`.                                                                                                                 | Founder | Arjun: repo for dev handoffs, Notion for decisions only.                         |
| 2   | Lead mechanism: `vishal` as the session agent (as written above), or the default Claude Code session plus a `ship-ticket` skill. The first enforces "lead does not edit" by tools but loses the default system prompt. The second keeps it but relies on the prompt. | Arjun   | Try the agent version on one ticket and compare.                                 |
| 3   | Two Vishals: `lawie-team:vishal` in Cowork and `vishal` here.                                                                                                                                                                                                        | Rita    | Cowork Vishal scopes and writes handoffs only. Code is written only in the repo. |
| 4   | Small-fix rule in section 5.                                                                                                                                                                                                                                         | Arjun   | Confirm or tighten.                                                              |
| 5   | `CLAUDE.md` as a conventions file. It was the task diary under the April protocol, and a diary loaded into every agent's context is wasted spend.                                                                                                                    | Arjun   | Conventions only. Diary goes wherever decision 1 lands.                          |
| 6   | Secrets readable in the checkout.                                                                                                                                                                                                                                    | Arjun   | Bash hook, sandboxing, or move real values out.                                  |
| 7   | Nikhil (DevOps). In the framework doc, absent from the plugin and from this repo.                                                                                                                                                                                    | Founder | Out of scope here. Decide separately.                                            |

---

## 10. Done when

- [ ] The seven fixes in section 2 are handled or consciously skipped.
- [ ] `CLAUDE.md`, `.claude/settings.json`, five agent files and four hook scripts exist and show in `git status`.
- [ ] `claude plugin validate .claude/agents` passes and all five agents load after a restart.
- [ ] Each hook is proven by a failing case: tester tries to edit source, developer tries to edit a test, reviewer tries to write a file, doc-writer tries to edit a `.ts` file. All four are blocked.
- [ ] `yarn workspace @lawie/drafting test` runs on this machine. The August setup note said yarn, Mongo and Redis were missing locally, so check this before relying on the tester.
- [ ] One small fix and one feature ticket have gone through their chains end to end, with the four reports in the PR.
- [ ] A ticket with no `SCRUM-n` key and no matching `T-nnn` file in `handoff/tickets/` is refused by the lead.
- [ ] Arjun has reviewed the agent files. Rita has added the crew to the roster as a second tier.

---

Sources

- Claude Code subagents: https://code.claude.com/docs/en/sub-agents
- Claude Code worktrees: https://code.claude.com/docs/en/worktrees
- Project docs: `Lawie_Agentic_Framework.md` (7 Aug 2026), `Lawie_Vishal_Protocol.docx` (Apr 2026)
- Installed plugin `lawie-team` v0.2.0
- This repo at `fix/branding-assets` @ `9459a72`
