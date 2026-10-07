# T-132 — Quality gate: every pull request passes through Anushka

| Field      | Value                                                                                                                                                                                                                                                                            |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase      | 0 — Prep                                                                                                                                                                                                                                                                         |
| Owner      | Rita (briefing), Arjun (rule in the repo), Kavya (records)                                                                                                                                                                                                                       |
| Mode       | Direct, from the war-room chat                                                                                                                                                                                                                                                   |
| Status     | Done, with one thing open. PR #48 merged by the founder, 6 Oct 2026, 17:11. The plugin (v0.3.0) is installed: `anushka` shows as an agent in the war-room chat, with browser tools only. Open: she has not tested anything yet, because the Claude browser pane is not signed in |
| Depends on | None                                                                                                                                                                                                                                                                             |
| Branch     | fix/t-132-quality-gate                                                                                                                                                                                                                                                           |
| Created    | 2026-10-06                                                                                                                                                                                                                                                                       |

## Goal

Nothing is merged until a lawyer who did not build it has used it in a browser and said it is good enough.

## Context

- Founder, 6 Oct 2026, 16:58: "we need a lawyer tester to test our built functionality end 2 end without being bias at all on browser. Why I am saying this is because I am not able to see that quality." He ordered a Chief Quality Officer on the board, a lawyer, who takes no part in solution building, has full access to the UI through a browser and does not touch the code. "From now on every push to the git must pass through Anushka."
- The two faults he named: a link to the Bihar police portal on the describe screen for every user (T-133), and a request for a bail application taken to be anticipatory bail without asking (T-134).
- Until now the same session wrote the code, wrote the test plan and passed it. The chat flagged several times that approvals in role voices were not independent reviews.

## What was done (Rita, Arjun, 6 Oct 2026)

- Briefing written: `agents/anushka.md` in the `lawie-team` plugin, version 0.3.0. Her tools are a browser's navigate, click, type and read. No file, terminal, script or network-inspection tool is on her list.
- War-room rules changed: the chain is now priya, arjun, rajesh, vishal, anushka, then the founder merges. She is invoked as a separate agent and is sent four things only.
- Rule in the repo, PR #48: `.claude/docs/quality-gate.md`, a pointer in `CLAUDE.md`, and a rule in `.claude/agents/vishal.md` that the lead ends each PR body with a quality line and never plays her.
- Notion: "Anushka — CQO Briefing" under Agent Briefings.

## What is not done

- The founder has not yet installed the plugin file. Until he does she is not an agent type in new chats.
- Nothing on GitHub enforces the rule. It holds because the founder merges.
- She cannot test at all right now: the Claude browser pane on the Mac is not signed in, and she does not sign in. Her first verdicts will be BLOCKED until the founder signs in there.
- The Mac's Vishal session needs a restart to read the changed `vishal.md`, after PR #48 is merged and pulled.
- The handbook file in the project (`Lawie_Agent_Team_Handbook_v1.1.docx`) is not updated. It planned a QA agent under Arjun; the founder's decision puts quality on the board instead.

## Why she cannot sign in through the Claude browser pane (17:1x)

- The founder could not sign in there; in Chrome it works.
- Lawie's only sign-in is "Continue with Google" (founder decision, 17 May 2026). The pane is a browser built into the Claude app and says so in its user agent. Google refuses sign-in from browsers built into other apps. Not confirmed from the screen: the chat did not see the error the founder got.
- The auth service has email and password routes (`/register`, `/login`), but the login page does not offer them.
- Ways out: (a) connect the Claude extension in the founder's Chrome, where he is already signed in; her tools include that browser. No Chrome is connected at 17:1x. (b) A test sign-in with email and password that works only on a local dev host. That is a code change in auth and web, and a test account in the production database, so it is Arjun's and the founder's call.

## Limits the founder should know

- She is a separate agent with no memory of how a thing was built. She is still the same kind of model as the team, and she is not an advocate enrolled with a Bar Council. The advocate round (T-402) stays.
- The gate is at the merge into `develop` and `main`, not at each push to a branch: she can only test code that is running.
- She can test only while the app is running on the founder's Mac with a signed-in browser. When it is not, pull requests wait.
