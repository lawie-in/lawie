# Dev crew — design notes

This file is for humans only. No agent reads it automatically — only root `CLAUDE.md` is auto-loaded into every session, which is why this exists as a separate file instead of being folded in there. Put anything here that would help someone maintain or extend the crew, but that a subagent doesn't need spent tokens on every run.

See `DEV_TEAM_SPEC.md` in this same directory for the full founder/CTO-approved spec this was built from, including the open decisions in its section 9 that are not resolved by this implementation.

## Why the files are split the way they are

`CLAUDE.md` is loaded in full into every single agent's context, every run — lead and all four crew. Anything in it is a standing cost multiplied by every dispatch in a ticket's chain. So it holds only what's universally needed (layout, stack, commands, branch convention, the crew protocol rules). Everything else — coverage thresholds, test gaps, golden-snapshot mechanics, the legal-content path list — lives under `.claude/docs/` and is only pulled into context when an agent actually `Read`s it, because its task calls for it. `CLAUDE.md` points at these files as plain paths, never with Claude Code's `@path` import syntax — that syntax eagerly inlines the target file's content at session start, which would defeat the point.

## Why there's no `mcpServers` block anywhere

It's not a valid key in `.claude/settings.json` — MCP server definitions only live in `.mcp.json`, a plugin manifest, or via `claude mcp add`. Nothing here currently needs a locally-declared MCP server. Jira access (for the lead to pull `SCRUM-n` tickets by key) goes through the "Atlassian Rovo" claude.ai connector instead — that's an account-level authorization, not a repo file, and it's already available to `vishal` with no extra frontmatter because he uses `disallowedTools` (a denylist) rather than `tools` (an allowlist). If you ever do add a project-level MCP server (e.g. a real Mongo/Redis MCP tool instead of the Bash+hook approach below), remember that individual crew agents can still be excluded from it by simply not listing its `mcp__<server>__*` tool names in their `tools:` allowlist.

## Why DB access is a Bash hook, not a tool

There's no MCP server for Mongo/Redis connected in this environment, and adding one just for this would be a new external dependency for a fairly narrow need (the `developer` and `tester` occasionally wanting to inspect local/dev DB state while debugging). Instead, `.claude/hooks/db-readonly.sh` applies the same PreToolUse pattern already used for the other hooks: it only triggers on commands mentioning `mongosh`/`redis-cli`, rejects any chaining or substitution outright (a read-looking prefix can't be trusted if something else could run after it), rejects anything that looks like it's targeting a non-local host, and — this is the part worth flagging if you touch it — **default-denies on the verb**. It requires the command to contain a recognized read operation, rather than blocklisting write operations. Blocklisting means an operation nobody thought to list (a raw `runCommand`, `renameCollection`, a Lua `EVAL` in `redis-cli`) slips through; default-deny means it's blocked by omission instead of missed by omission. `reviewer` and `doc-writer` don't get this hook or `mongosh`/`redis-cli` access at all — their job is diffs and docs, not live data.

## Why `readonly-bash.sh` checks both sides of a pipe

The spec's original one-line sketch was "allows only the git read commands." A first-word match on that alone would let `git status; rm -rf .` through, since the string still starts with an allowed command. The hook rejects `;`, `&&`, `||`, backticks, and `$()` outright, and for the one case worth keeping — a single `|` into a text filter, e.g. `git log | grep fix` — it checks **both** sides against the allow-list, not just the left side. Same shape of fix applies in `db-readonly.sh`.

## Why `permissions.deny` plus `no-secrets-bash.sh`, not just one or the other

The spec flagged "`Read` deny doesn't reliably stop `cat .env` through Bash" as a known gap. That's narrower than it sounds: Claude Code's `Read`/`Edit` deny rules do also cover the Bash file-read commands it recognizes (`cat`, `head`, `tail`, `sed`, `tee`) and redirection targets, so `cat .env` is already blocked by `permissions.deny` on current versions. What it doesn't cover is a command that reads a file without naming it to that recognizer — `grep -r SECRET .`, a `node -e`/`python -c` subprocess that opens the file itself, `base64 < .env`. `no-secrets-bash.sh` is scoped to exactly that residual surface, wired globally in `settings.json` so it applies to every agent including the lead's own main session. It's defense-in-depth on top of `permissions.deny`, not a replacement for it, and neither one is a sandbox — real secret values should still eventually move out of this checkout, per the spec's own recommendation.

## Division of git responsibility

Only the lead (`vishal`) runs `git commit`/`git push`/`gh pr create`, after collecting all four crew reports. Crew agents only modify the working tree. This isn't enforced by a hook — it's structural (none of the four crew prompts mention committing, and the flow is strictly sequential in one checkout per the spec's own worktree correction in section 1) plus the `permissions.ask` gate on `git push`/`gh pr merge`/`gh workflow run`, which only the lead's main session can actually answer since subagents can't use `AskUserQuestion`.

## Adding a sixth crew agent later

Drop a new file under `.claude/agents/dev/`, give it a `name`/`description`, scope its `tools`/hooks the same way the existing four do (allowlist what it needs, hook-restrict any destructive surface Bash gives it that the allowlist alone can't stop), and update the flow description in `vishal.md`'s prompt. Restart the session afterward — new files under `.claude/agents/` need a restart to be picked up.
