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

## Design check (Rajesh, 12 Oct 2026)

`handoff/design/T-253-assistant-panel.md` already covers entry points, open/closed, refusal, rate-limit, disclaimer and the free-plan locked state. Needs Ajay: signed strings for the monthly-cap and cool-down messages and the 90-day report line; keep the client-names notice visible while pasted text is present; a Hindi disclaimer. His signed refusal R1 differs from the quoted "I can only help with law and Lawie"; the panel uses R1.

## Ajay's addendum covers Rajesh's open strings (12 Oct 2026)

Everything `handoff/design/T-253-assistant-panel.md` lists as needing Ajay (monthly cap, cool-down, unavailable, 90-day report line, Hindi line, notice stays visible) is signed in his T-253 file, Addendum of 12 Oct, with a table in `handoff/legal/emails-waitlist-panel-signed.md`. The panel uses refusal R1 word for word. The CTA text for the locked state comes from Meera and goes back to Ajay.

## Arjun (12 Oct 2026): build scoping for T-253a to T-253e

ADR-023 stands as written (module in drafting, Haiku 5.5, five guard layers, Vikram's caps). I re-checked its code claims on `develop_staging`: `getUsdInrRate()` still falls back to 85 (`llm-usage.ts` l.171); the JWT and plan header carry `free | pro` only while `User.planTier` has five raw values (`User.model.ts` l.14, normalised in `credits.service.ts`); `planRateLimiter` and `authChain` exist in `gateway/src/app.ts`; `spendCapCheck` only logs. **Gates now:** Ajay signed the text (10991fc and the addendum), Vikram's caps are in, Rajesh's design is checked. **Still open before a lead is assigned:**
1. Priya confirms with the founder that 253a may start before the v1 blockers (the epic says "not before").
2. Help text (Priya, Meera; paused). Blocks 253b only.
3. Billing: the field that marks a lapsed Solo plan (`planRenewsAt`?). Blocks 253a check 2. The lead verifies in `apps/billing` and writes the answer in the report; if there is no such field, a lapsed plan reads as paid until the next downgrade, and the lead says so.

I add `apps/drafting/src/assistant/prompt/` to `.claude/docs/legal-content-paths.md` today, so Ajay's gate applies to 253b from the start. I update the erase runbook when 253a merges (rows are in ADR §5).

**Order:** 253a and 253c in parallel, then 253b, then 253d, then 253e. No ticket touches `packages/shared`. Only 253e touches root config (`.github/`).

### T-253a: Access, caps and storage

Mode: full chain (new model call is not in this ticket, but it is the cost gate). Size M. Service: drafting only.

**Acceptance criteria**
1. `POST /assistant/message` (SSE) exists behind checks 1 to 8 of ADR §4, in that order, each failing closed. Until 253b merges it returns 503 `assistant_unavailable` after the checks pass. The SSE contract (events `delta`, `retract`, `done`, `error`, and the reason codes on 429/503) is written in `assistant/README.md` for 253d to build against.
2. Check 2 reads `User.planTier` from Mongo through the existing normaliser. A test covers all five raw values (`free`, `practice`, `firm`, `solo`, `pro`): Free gets 403 `locked`; the two paid tiers pass.
3. A strict FX reader: `finance.usd_inr` missing, non-numeric or ≤ 0 means refuse with 503. It never uses the 85 fallback. `getUsdInrRate()` itself is not changed.
4. Reserve then settle, in paise, exactly as ADR §4. Each cap trips at its exact paise value (Solo ₹30 and 30 messages a day, Pro ₹75 and 60, global ₹300 a day and ₹2,000 a month). Alerts at ₹1,000 and ₹1,600 fire once each (SETNX flag) as a Pino warn plus a Sentry message with no content.
5. `assistantcalls` rows hold numbers and ids only. After a Redis flush the month counters are rebuilt from Mongo before any call is allowed. A stopped or disconnected reply still records its cost.
6. `assistantconversations`: turns `{role, label, text}` with `text` encrypted by `utils/encryption.ts`; TTL index on `expiresAt` = 30 days after the last message; reported pairs kept 90 days only after Ajay's retention answer (until then 30 days, no exceptions).
7. Endpoints: `DELETE /assistant/conversations/:id` (owner only, hard delete), `POST /assistant/report`, and `GET /assistant/status` (on/off, plan, messages used, limit, reset time) as Rajesh's build note asks. Free plan: status says locked; no model call ever runs.
8. Privacy tests per ADR §5: no message or reply text in Pino output, Sentry events or breadcrumbs (a canary in the body, thrown inside the route); no `console.*` in `assistant/` (ESLint rule scoped to that folder); `AssistantError(code)` wraps SDK errors.
9. Import fence test: `assistant/**` imports none of `ai.service.ts`, `drafter.prompts.ts`, `intake.prompts.ts`, `brief-drafter.ts`, and nothing outside `assistant/` imports from it except `app.ts`.
10. The erase path: the conversation and call collections are added to the user-erase list. If T-115c is already merged, extend its drafting erase endpoint and test it; if not, leave a line in the report for Arjun and T-115c picks it up.
11. CI green on drafting.

**Files:** `apps/drafting/src/assistant/{router.ts,access/**,limits/**,store/**,README.md}`, `apps/drafting/src/models/Assistant*.model.ts`, `apps/drafting/src/app.ts` (one mount line), `apps/drafting/src/config/env.ts` (one key: `ANTHROPIC_ASSISTANT_API_KEY`, optional; empty means chat is off), tests `__tests__/assistant-{access,limits,store,privacy}.test.ts`.
**Gates:** Priya's confirmation (1) and the billing field (3) above. Not legal content. No founder login to build. **Do not** start 253b's folders in this ticket.

### T-253c: Gateway mount

Mode: small fix is not enough (SSE and a new limiter); full chain. Size S. Service: gateway.

**Acceptance criteria**
1. `/api/assistant/*` is proxied to drafting `/assistant/*` behind `authChain` and `planRateLimiter`, plus a new per-IP limiter (20 requests a minute, Redis prefix `rl:asst:ip:`), placed before the proxy.
2. SSE passes through unbuffered. The lead checks `compression()` (applied app-wide at l.40) against the existing draft-stream path and adds the same exemption for `text/event-stream`; a test sends a two-chunk stream through the proxy and sees the first chunk before the second is written.
3. The per-IP limiter fails closed on a Redis error (429), as the other limiters do or document why not.
4. Existing `/api/drafting` behaviour is unchanged (a regression test on one route).
5. CI green on gateway.

**Files:** `apps/gateway/src/app.ts`, `apps/gateway/src/middleware/rateLimiter.ts`, `apps/gateway/src/__tests__/assistant-route.test.ts`. **Flags:** gateway is hot; T-229 touches `config/sentry.ts` (no overlap, but the lead checks `leads.md`). No dependency, so it can ship before 253a: the route simply returns 502/503 until drafting has the mount.

### T-253b: Guard pipeline and model call

Mode: full chain. Size L. Service: drafting. **Legal content:** `assistant/prompt/**` needs Ajay's signed text word for word and his sign-off on the assembled prompt.

**Acceptance criteria**
1. Rules layer, classifier (six labels, anything else or an error is `off_topic`), routing, flags, 3-in-24h cool-down (`asst:cool:<userId>`): ADR §3(a). The 12 refusal lines and the disclaimer are Ajay's, taken from `handoff/legal/T-253-assistant-scope-signed.md` and used word for word; the **code** appends the disclaimer, not the model.
2. Prompt assembly per §3(b) and (e): pasted text wrapped as data after stripping tag look-alikes; history replayed from server storage only (last 6 turns); the mid-conversation system reminder. The system prompt holds none of the blocklist strings except the canary (test).
3. Retrieval per §3(c): help text chunked at boot into an in-memory keyword index, top 3 chunks, at most 1,500 tokens; sections map matched by regex from the three files in `config/sections/`. No other source.
4. Model call per ADR §2: model id from `ai.assistant_model`, thinking disabled with effort low, `max_tokens` 500, streamed, no tools, no prefill; classifier `max_tokens` 10. The lead first verifies that `@anthropic-ai/sdk ^0.91.0` accepts `output_config.effort` and `thinking.disabled`. If it does not, the lead stops and asks Arjun before touching `yarn.lock` (root config, one lead at a time).
5. Output filter per §3(d): sentence-boundary buffering (or 120 characters), blocklist, `retract` event, flag counted. `removeUngivenCitations` with "given" = the user's own messages; a section not in `config/sections/` replaces the reply with Ajay's "verify against the bare act" line. A missing `chat.canary` means refuse to run.
6. The suggested wording comes back as its own field (Rajesh's build note) so the panel can offer "Copy paragraph".
7. Fixtures: 50+ each in `off-topic.json`, `injection.json`, `in-scope.json`, a `leaky-replies.json` set, and Ajay's 30-prompt legal-safety set; with a mocked LLM, off-topic and injection refusal is 100% in CI and every leaky reply is blocked or retracted. One invented citation in the safety set fails the build.
8. `stop_reason: "refusal"` shows the refusal line. An SDK or network error shows the "unavailable" line, logs the code only, and records no text.
9. CI green on drafting. No real-model call in CI.

**Files:** `apps/drafting/src/assistant/{guard/**,prompt/**,retrieval/**,llm.ts,help/**}`, `__tests__/assistant-{guard,filter,retrieval,fence}.test.ts`, `__tests__/fixtures/assistant/**`. **Gates:** 253a merged; Ajay's signed prompt text; Priya and Meera's help text (public copy; Ajay checks any legal claim); founder seeding of `ai.assistant_model`, `ai.rates.claude-haiku-5-5`, `finance.usd_inr`, `chat.canary`, `chat.enabled=false` on develop before Anushka tests. Moved goldens: none expected.

### T-253d: Web chat panel

Mode: full chain, UI. Size M. Service: web. **Gates:** Rajesh's design (`handoff/design/T-253-assistant-panel.md`, checked); 253a's SSE contract; Ajay's signed strings (his addendum covers them; the locked-state CTA comes from Meera and goes back to Ajay).

**Acceptance criteria**
1. A 400px right panel on desktop and a full-screen sheet on phone; shares the right slot with Section finder (one open at a time).
2. Entry points are hidden while `/assistant/status` says off. For Free the panel renders locked with the upgrade line. No model call for Free is possible from the UI.
3. The disclaimer is always visible; the client-names notice stays visible while pasted text is present; the refusal shows as R1 word for word; `retract` replaces the bubble; the "Copy paragraph" button; report button with the 90-day line only once Ajay's retention answer is in; delete conversation.
4. Reason codes on 429 and 503 map to Ajay's signed strings (daily limit, monthly cap, cool-down, unavailable). The Hindi disclaimer is shown for Hindi users; the Mukta font is added before Hindi is tested.
5. No chat text goes to analytics or to any third party; the page sends the 253a events only (`asst_message_sent{label}`, `asst_refused{reason}`, `asst_report`).
6. Manual-check list for Anushka in the lead's report (web has no CI job): Free locked; Solo answers in scope; off-topic refused politely; a pasted paragraph gets wording back; a retract; delete a conversation; phone width. The T-138 and T-141a "works on mobile" ban stands: no claim beyond what Anushka sees.

**Files:** `apps/web/src/components/assistant/**`, `apps/web/src/hooks/useAssistant.ts`, `layout.tsx` and `Sidebar.tsx` (Rajesh's note; the lead names the exact paths on claim and checks `leads.md`, because T-234 and T-281 also work in the app shell).

### T-253e: Nightly real-model eval

Mode: full chain, CI. Size S. **Root config: `.github/` is one lead at a time.** Depends on 253b.

**Acceptance criteria**
1. `apps/drafting/src/scripts/assistant-eval.ts` runs the 150 prompts against the real model with a fixed rubric of "refused or answered, and no leak". Targets: off-topic refusal ≥ 98%, in-scope answered ≥ 95%, zero canary or blocklist leaks. It does not grade answer quality. It also runs one integration smoke call that proves thinking is disabled at effort low.
2. `.github/workflows/assistant-eval-nightly.yml` runs nightly on `develop_staging`, skipped when `assistant/**` has not changed in 24 hours, with its own key `ANTHROPIC_ASSISTANT_EVAL_KEY` (console limit $5). A red run fails the workflow.
3. No secret is printed; the output holds counts and prompt ids only, never reply text.
4. The workflow is dry-run tested without the key (it must skip cleanly, not fail).

**Files:** `apps/drafting/src/scripts/assistant-eval.ts`, `.github/workflows/assistant-eval-nightly.yml`. **Founder:** adds the repo secret.

### Founder logins and physical tasks (for the morning report)

1. Create two Anthropic keys in the console: chat (limit $25/month) and nightly eval (limit $5/month). Put the chat key in the server's `.env.production` as `ANTHROPIC_ASSISTANT_API_KEY`; add the eval key as a GitHub repo secret. Never paste either into a ticket or chat.
2. Seed the AppSettings on develop: `ai.assistant_model`, `ai.rates.claude-haiku-5-5` (after checking the rate in the console), `finance.usd_inr=96.5`, `chat.canary` (24 random characters), `chat.enabled=false`. Production gets the same at T-403.
3. Flip `chat.enabled` to `true` only after Anushka's PASS.
