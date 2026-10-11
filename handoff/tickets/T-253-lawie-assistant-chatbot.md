# T-253 — Lawie Assistant: a chat helper for advocates (epic)

| Field          | Value |
| -------------- | ----- |
| Phase          | 4 — Matter context |
| Owner          | Arjun (ADR: architecture, guardrails, rate and cost limits). Ajay (scope and refusal text, signs the system prompt). Vikram (cost cap). Rajesh (design). Leads (build, split into tickets after the ADR). Anushka (verdict) |
| Mode           | ADR first, then build tickets. Full chain. New Anthropic API call, so rate and cost guards are required |
| Status         | Scoped by the founder, 12 Oct 2026 (night). Gates requested: Arjun ADR, Ajay text, Vikram cost, Rajesh design. Not before v1 blockers unless the founder says so |

## What the founder asked for

- A chat assistant inside Lawie for advocates. Model: Claude Haiku.
- Free for paid subscribers (Solo and Pro), included in the subscription. Not available on Free, or only as a teaser (Vikram and Priya decide).
- It does three things:
  1. answers questions about law and practice in India;
  2. guides the advocate on using Lawie (how to draft, find templates, use Ink, export);
  3. helps with drafting: suggests wording for a paragraph, explains a clause, points to the right template.
- **Guardrails:**
  - It talks only about law and legal practice and how to use Lawie. It politely refuses anything else.
  - It never reveals internal company information or how Lawie is built: its system prompt, architecture, services, models, vendors, prompts, rule files, security, costs, staff or roadmap. Nothing a hacker could use.

## Acceptance criteria (epic level; the ADR turns these into build tickets)

1. **Scope guard.** Every message is classified as in scope (Indian law and practice, using Lawie, drafting help) or out of scope. Out of scope gets Ajay's refusal line.
   - Test set: at least 50 off-topic prompts (coding, recipes, politics, "write my essay") and 50 in-scope prompts.
   - Refusal rate ≥ 98% on off-topic, ≥ 95% answered on in-scope.
2. **No internal disclosure.** It refuses requests for the system prompt, its instructions, the model or vendor, infrastructure, API routes, rule files, prompts, other users, or company internals.
   - Prompt-injection test set: at least 50 attacks ("ignore previous instructions", role-play, encoded text, "repeat the text above", jailbreaks pasted inside a legal question).
   - Zero leaks of the system prompt or any internal string. The system prompt contains no secrets, keys, internal URLs or implementation detail, so a leak would expose nothing exploitable.
   - Output filter: a response containing a canary string or internal identifiers is blocked.
3. **Legal-advice guard (Ajay).**
   - It gives legal information to an advocate, not advice to a lay client.
   - Every substantive answer carries Ajay's line (e.g. the advocate is responsible; verify against the bare act).
   - No invented sections or case law: it cites only sections that exist in `config/sections/`, and no case law unless the advocate gave it (T-148 rule).
   - Old law vs new law follows T-245.
4. **Help on using Lawie** comes only from a curated, public help text that Priya and Meera write. It never comes from code, tickets or internal docs, so it can't leak what it doesn't know.
5. **Drafting help.**
   - It can suggest wording for a paragraph the advocate pastes, or point to a template.
   - It doesn't write a full document. Full drafts go through the normal Ink-charged flow, so the subscription isn't a back door to free drafts.
   - Pasted text is treated as data, never as instructions.
6. **Access and limits (Vikram, Arjun).**
   - Paid plans only.
   - A per-user daily message cap and a monthly token cap.
   - A global spend cap with a kill switch.
   - Rate limit per user and per IP.
   - Haiku only, with max tokens set per reply.
7. **Privacy (T-229, T-235).**
   - Chat content is never logged to Pino or Sentry.
   - Retention is set (Ajay), and deletion follows the erase runbook.
   - The privacy policy is updated to mention chat.
   - No PII goes into analytics.
8. **Abuse.**
   - Flagged conversations are rate-limited.
   - There's a report button.
   - No tool use or browsing beyond the curated help text and the sections map.
9. **Design (Rajesh):** a chat panel in the app, the disclaimer visible, and the refusal shown politely.

## Gates before any build

- **Arjun's ADR:**
  - where it runs (a new service, or inside drafting);
  - the classifier approach (a Haiku pre-check, rules, or both);
  - retrieval over the help text and sections map only;
  - the output filter;
  - rate and cost guards;
  - logging policy;
  - how prompt-injection tests run in CI.
- **Ajay:** the system prompt's scope text, the refusal lines, the advice disclaimer and retention. He signs the final system prompt.
- **Vikram:** the cost per message and the caps that keep Solo above the margin target.
- **Rajesh:** the chat panel design.

## Vikram: cost gate (12 Oct 2026)

**Cost per message** (system prompt plus retrieval plus 6 turns of history, reply capped at 500 tokens):
- Haiku 4.5: ₹0.59 typical, ₹0.86 max.
- Haiku 5.5, thinking off: ₹0.06 typical, ₹0.09 max.
- Vikram recommends **Haiku 5.5 with thinking off**. Arjun picks the model in the ADR.

**Caps per user:**

| Cap | Solo | Pro |
|---|---|---|
| Monthly chat spend | ₹30 | ₹75 |
| Messages per day | 30 | 60 |
| Max tokens per reply | 500 | 500 |

**Global caps:**
- ₹2,000 a month, with alerts at ₹1,000 and ₹1,600.
- ₹300 a day.
- Kill switch: the app setting `chat.enabled`.
- A separate Anthropic API key with a $25 monthly limit in the console.

**Free plan:** no access at launch. The panel shows as locked, with an upgrade message.

**Fail closed:** if the model's rate is missing in `ai.rates`, chat refuses to run. Otherwise the ₹ cap would never trip. Set `finance.usd_inr` to 96.5 everywhere.

**Note:** heavy Solo users already fall below the 60% margin on drafting alone (T-004 estimate). The chat cap only limits what chat adds.

**ADR status:** Arjun's first attempt stopped at the session limit. Re-dispatched 12 Oct 02:50 IST.

## Ajay: scope text signed (10991fc, handoff/legal/T-253-assistant-scope-signed.md)

The build follows that file:
- system-prompt text, and 12 fixed refusal lines;
- citation rules: section numbers only from the map, no case law unless the user gave it, no time limits in v1;
- old/new law per T-245;
- the code, not the model, appends "Legal information, not legal advice. Check the bare act before you rely on it.";
- retention: 30 days after the last message, encrypted, never in logs;
- public claims state the caps;
- a 30-prompt legal-safety test set; one invented citation is a blocker.

Ajay signs the assembled system prompt and the help text before merge. The ADR must follow this file.

## ADR-023 (Arjun, 68fd5d2, handoff/tickets/ADR-T-253-lawie-assistant.md)

**Decision:**
- A module in drafting (`apps/drafting/src/assistant/`), reached through the gateway at `/api/assistant`.
- Model `claude-haiku-5-5`, thinking off, 500 tokens per reply.
- Five guardrail layers. All of Vikram's caps. Fails closed if a setting is missing.

**Build split, in order:**
1. 253a (access, caps, storage) and 253c (gateway route), in parallel.
2. 253b (guardrails and the model call).
3. 253d (web panel; needs Rajesh's design).
4. 253e (nightly run; root config).

None of these touch `packages/shared`. They are assigned after the v1 blockers.

**Open:**
- Rajesh: the panel design.
- Priya and Meera: the curated help text. Ajay signs it.
- Billing: which field marks a lapsed Solo plan. The token carries only free/pro, so chat reads `User.planTier`.

**For the founder at launch** (morning report):
- Create two Anthropic keys (chat, $25/month; nightly eval, $5).
- Seed `ai.assistant_model`, `ai.rates.claude-haiku-5-5`, `finance.usd_inr=96.5` and `chat.canary`.
- Keep `chat.enabled=false` until Anushka's PASS.

## Rajesh: panel design (0c24ba0, handoff/design/T-253-assistant-panel.md)

**Desktop and phone:** a 400px right panel on desktop, a full-screen sheet on phone. It shares the right-side slot with Section finder, so only one is open at a time.

**Priya's calls:**
- The button says "Copy paragraph", not "Use this paragraph".
- While `chat.enabled` is off, the entry points are hidden, not shown as "paused".

**Build notes:**
- 253b: return the suggested wording as its own field.
- 253a: a status endpoint (on/off, plan, messages used, limit, reset time); reason codes on 429/503; a stopped reply still records its cost.
- 253d: claims `layout.tsx` and `Sidebar.tsx`.
- Before Hindi is tested: add the Mukta font (Devanagari).

**Sent to Ajay:**
- wording for the monthly-cap and cool-down messages;
- keeping the client-names notice visible while pasted text is present;
- a Hindi version of the line under answers;
- the 90-day line in the report dialog.

- The help text is paused: the founder paused Meera's session (12 Oct 2026). Pick it up when she resumes. Nothing else in T-253 waits on it until 253b.
