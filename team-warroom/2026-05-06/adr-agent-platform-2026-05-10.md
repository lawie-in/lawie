# ADR — Lawie Internal Agent Platform (API-based, concurrent)

- Date: 2026-05-10
- Status: Proposed (recommendation: DEFER until Phase 1 paid users >= 25)
- Author: Arjun (CTO)
- Decision driver: Founder Abhinav wants to remove the Cowork conversation bottleneck and run all 11 role agents (arjun, priya, vishal, meera, madhuri, rajesh, ajay, vikram, rita, kavya, annu) concurrently with central control.

---

## 1. Current state — honest summary

### How it works today
- Cowork desktop app loads the `lawie-team` plugin.
- Founder types `/warroom` or `@arjun ...`; Cowork dispatches to a subagent via the local agent SDK.
- Each subagent has its own system prompt, tool whitelist (Notion, Jira, Atlassian MCPs, fs).
- Subagents are dispatched serially inside one Cowork conversation. Memory is a flat `MEMORY.md` plus per-role files.
- Dev tickets land in `/docs/inputToDev.md`; Vishal logs work in `/docs/CLAUDE.md`.

### What works
- Zero infra. No servers to babysit.
- Skill loading + plugin model + role prompts are already battle-tested.
- Notion + Jira MCPs are wired and the founder is fluent in the flow.
- Cost is one Anthropic key, billed per actual use.

### What is actually painful (the real ask)
1. **Serialization.** Founder waits while one subagent finishes before another starts. Cannot kick off "priya scope X, meera draft Y, vishal patch Z" in parallel.
2. **No background work.** Agents only run while the Cowork window is open. No nightly Notion review, no scheduled standup, no Jira sync at 7am.
3. **One conversation = one context.** The context bloats; @priya sees @vishal's noise; founder cannot keep "PR review thread" separate from "GTM thread."
4. **No central status.** Founder has no dashboard answering "what's each agent doing right now / last 24h / cost so far."
5. **Hand-offs are manual.** When arjun writes an ADR Vishal needs, founder has to copy-paste it into a new prompt.

This is what a rebuild would actually fix. Everything else (prompts, roles, skills) is fine.

---

## 2. Architecture options

| Option | Build effort | Reuse Lawie infra | Founder UX | Risk |
|---|---|---|---|---|
| A. Self-hosted Node workers + BullMQ + Redis + Mongo + Next.js dashboard | 3–4 weeks | High (Atlas, Redis, EC2, Anthropic SDK already in repo) | Custom dashboard + chat | Medium — we own the orchestration code |
| B. LangGraph (Python) | 4–6 weeks | Low (introduces Python service) | Need to build UI anyway | High — new language in the stack, debugger pain |
| C. Anthropic Agent SDK (Claude Agents) | 3–5 weeks | Medium (Node SDK fits) | SDK is opinionated | Medium — early product, MCP-native, fewer escape hatches |
| D. Hybrid — keep Cowork for ad-hoc, add thin async worker for scheduled jobs | 1–2 weeks | High | Cowork stays primary | Low — solves 80% with 20% of the work |

### Pick: **D (Hybrid) now, with a clean upgrade path to A** if Phase 1 succeeds.

Rationale:
- Cowork already does the hard parts (role prompts, skill loading, MCP plumbing, founder UX). Replacing it costs 3–4 weeks of Vishal — Vishal is also the only person shipping the actual Lawie product.
- 80% of the "concurrency + central control" pain is solved by adding (i) a scheduled-task runner and (ii) a per-agent persistent inbox in Mongo. Not by rebuilding the agent runtime.
- If after Phase 1 the bottleneck is still real, we already have the foundation (Redis + Mongo + Anthropic SDK + EC2) to build Option A in 3 weeks without throwing anything away.

If the founder rejects D and insists on a full rebuild, **the answer is A**. Reasons:
- Repo already runs Express services on docker-compose with Mongo Atlas + Redis.
- Vishal is a Node dev. Python (B) or a new SDK (C) doubles the learning curve.
- We retain control of the loop; Anthropic SDK lock-in (C) is unproven at this scale.

The rest of this ADR specs **Option A** as the documented "if we do build it" target, plus the Option D minimal step we should take in May.

---

## 3. Component breakdown (Option A — for the future build)

### 3.1 Agent runtime
- One Node worker process per agent role (11 workers). Each is a `BullMQ` consumer subscribed to its own queue (`q:arjun`, `q:priya`, etc.).
- Workers run inside a single `agents` container in `docker-compose.prod.yml`, using PM2 / Node cluster to fan out 11 processes. Single container = single deploy, simpler than 11 services.
- Per-job runtime: pull job, load role system prompt + recent memory from Mongo, call Anthropic SDK with tool definitions, write result back to Mongo, ack the job.

### 3.2 Orchestrator / task router
- New service `apps/orchestrator` (Express, port 4004).
- Endpoint: `POST /tasks { agent, prompt, parent_task_id?, priority }` → enqueues to `q:<agent>`.
- Router parses founder commands: `@arjun ...` → push to `q:arjun`. `/team review X` → fan out to 4 agents in parallel.
- Cron jobs (scheduled-tasks) push background work (e.g. "priya: nightly Jira triage at 02:00").

### 3.3 Inter-agent communication
- Agents do NOT call each other directly. They emit `task` records with `parent_task_id` pointing back. The orchestrator picks these up and routes.
- This keeps loops bounded: orchestrator enforces `max_depth=3` on any task tree. No agent can spawn a runaway chain.

### 3.4 State persistence
- Mongo collections:
  - `agent_messages` — per-agent rolling conversation, capped at 50 turns.
  - `agent_memory` — distilled long-term notes (Notion remains source of truth for shared docs).
  - `tasks` — task tree, status, cost, duration, parent/child links.
- Redis: BullMQ queues + per-agent rate limits + short-lived locks.

### 3.5 Tool access
- Anthropic SDK tool-use, with tools implemented as thin Node functions:
  - `notion_*` → wrap Notion REST API directly (Notion MCP is for Cowork; in our service, call the API).
  - `jira_*` → Atlassian REST.
  - `fs_*` → restricted to `/Users/abhinavanand/Files/Lawie` mount on EC2.
  - `anthropic_chat` → standard SDK call (delegation between agents goes via orchestrator, not tool).
- Secrets via existing AWS Secrets Manager. No new vendor.

### 3.6 Founder UI
- Add a route in `apps/web` (Next.js): `/team`. Two panes:
  - Left: per-agent chat threads (one tab per role; switch instantly, all live).
  - Right: timeline of all task runs (status, agent, cost, latency, output preview).
- Slack-style command bar at the bottom: typing `@vishal patch the auth bug` posts to orchestrator.
- Auth: founder-only. Reuse existing JWT from `apps/auth`.

### 3.7 Observability
- Each task writes one line to `tasks` collection: `{agent, model, input_tokens, output_tokens, cost_inr, duration_ms, error?}`.
- A `/team/metrics` page renders: tasks/day per agent, p50/p95 latency, ₹/agent/day, error rate. Mongo aggregation is enough at this scale.
- Cost cap: per-agent daily budget in env (`AGENT_BUDGET_INR_DAY=200`). Worker refuses jobs and posts back to founder when exceeded.

---

## 4. Implementation plan (Vishal solo, if we green-light)

| Week | Deliverable |
|---|---|
| 1 | New `apps/orchestrator` skeleton + `tasks` Mongo schema + BullMQ wiring. Smoke test: enqueue → worker logs prompt → echoes response. |
| 2 | One real agent (arjun) running end-to-end with Anthropic SDK + 3 tools (notion_read, jira_read, fs_read). Cost tracking writes to Mongo. |
| 3 | All 11 agents stamped from arjun template. System prompts copied from Cowork plugin. Cron scheduler online. |
| 4 | `/team` Next.js dashboard (threads + timeline + metrics). Founder onboarding doc. |

**Day-30 ship target:** founder fires `@arjun design X` and `@priya scope Y` from the dashboard at the same time, sees both responses stream into separate threads, and can read a daily cost report. No regressions on lawie.in.

---

## 5. Founder daily flow

- Morning: founder opens `https://team.lawie.in/team`. Sees a digest tile: "Last 24h — 14 tasks, ₹47 spent, 2 agents idle, 0 errors." Below: scheduled overnight outputs (priya's Jira triage, meera's content draft).
- Founder types `@arjun design RBAC for v2 of drafting service` in the command bar. Task posts; arjun thread shows "running…" with token counter. Streamed response lands in 30s.
- In parallel, founder types `@madhuri write 5 LinkedIn posts on BNS section 354`. madhuri thread starts. Both run concurrently — no blocking.
- "Status" command (`/status`) returns a one-screen table: agent, last task, status, today's cost, last error. No chat needed.
- Hand-off: arjun's ADR auto-references `parent_task_id`; founder clicks "send to vishal" and the orchestrator routes it as a child task with the ADR attached.

---

## 6. Top 3 risks + mitigations

1. **Orchestration debugging.** When agent loops misbehave, founder sees "stuck" with no stack trace. → Mitigate: every task is a Mongo doc with the full prompt, tool calls, and response saved. `/team/tasks/:id` page shows the trace. Hard cap `max_depth=3` and `max_tool_calls=10` per task.
2. **Cost runaway.** 11 agents, scheduled jobs, parallel tasks → an Anthropic bill spike is real. One agent stuck in a tool-call loop = ₹5000 in 30 min. → Mitigate: per-agent daily budget enforced by the worker (refuse jobs over cap). Anthropic billing alert at $20/day. Default model = Sonnet, opt-in for Opus.
3. **Distraction from Lawie itself.** This is internal tooling. Phase 1 goal is 25 paying advocates by August. Vishal spending 4 weeks on agent infra means 4 weeks not shipping templates, fixing demo bugs, or supporting Jharkhand pilot users. → Mitigate: this is exactly why I am recommending DEFER (see §8).

---

## 7. What this rebuild does NOT do (honest losses)

Cowork does several things well that we would lose or have to rebuild:
- **Skill auto-loading.** Cowork matches user intent to skill files; we'd need to bake that into the system prompt manually.
- **Built-in MCP catalog.** Cowork ships Notion / Jira / Slack MCPs zero-config; we'd write thin wrappers around each REST API.
- **Local file-system access with permissions UX.** Cowork's `request_access` flow is genuinely good; our equivalent is just "the worker has the EC2 mount."
- **Plugin distribution.** If we ever wanted other founders to use this team-of-agents pattern, Cowork's plugin model is a real distribution channel; a self-hosted dashboard is not.
- **No infra to run.** Cowork is free at our scale; the rebuild adds an EC2 worker container + Redis pressure + a dashboard to maintain.

This rebuild is justified only if "concurrent + scheduled + central status" is a recurring daily blocker — not a one-time annoyance.

---

## 8. CTO recommendation: **DEFER**

Stay on Cowork through Phase 1. Add the minimal Option D layer in May (5–7 dev days, not 4 weeks).

### Why defer
- The current Cowork setup did not stop us shipping 6 production templates and demo.lawie.in. The actual blocker right now is the Jharkhand advocate review — not the agent runtime.
- Vishal is the single dev. 4 weeks on internal tooling = 4 weeks not building paid-tier features, payments edge cases, or template #7–10. That directly delays the 25-paying-user target.
- The founder's pain (serialization, no scheduling, no status) is real but is mostly cosmetic until volume of agent commands per day exceeds ~20. We are nowhere near that.

### Minimal Option D (do this now, ~1 week)
1. **Scheduled task runner.** Tiny Node service on existing EC2 that calls the Anthropic SDK on cron and posts results into a Notion "Agent Outbox" page. Use it for: nightly priya Jira triage, weekly arjun cost review, daily kavya inbox sweep. Code lives in `apps/scheduler`. ~2 days.
2. **Per-agent inbox in Notion.** One Notion DB. Each agent writes a row when it finishes a task in Cowork. Founder gets a single "what did the team do today" view without rebuilding anything. ~1 day.
3. **Cost dashboard.** Single Next.js page in `apps/web` that pulls Anthropic usage API and groups by tagged metadata (`x-agent-name` header on each call). ~2 days.

**Revisit decision when:** founder is firing >20 agent commands/day, or scheduled jobs cross 10/day, or Phase 1 hits 25 paying users (whichever first).

### Trigger to switch to Option A
- Phase 1 paid users >= 25, AND
- Founder log shows >50% of mornings start with "wait for arjun to finish before priya can start," AND
- Vishal has bandwidth (no template work in flight).

If those three are true, build Option A in 4 weeks. Until then, the smartest engineering move is to not build it.

---

## Decision

- **DEFER** the full rebuild.
- **APPROVE** the minimal Option D layer (scheduler + Notion outbox + cost page) for the next sprint, scoped by Priya as one Jira epic.
- Re-evaluate in 90 days.
