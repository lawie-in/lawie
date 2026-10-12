# ADR-023: Lawie Assistant (T-253)

| Field | Value |
| --- | --- |
| Status | Proposed. Arjun, 12 Oct 2026 (IST). Priya decides for the founder. Ajay, Vikram and Rajesh gates still open |
| Epic | `handoff/tickets/T-253-lawie-assistant-chatbot.md` |
| Supersedes | Nothing. The first attempt left no file |
| Gate | No build ticket starts before this ADR is accepted, Ajay signs the prompt text, and Vikram's caps (below) stand |

## Facts from the code that shape this ADR

- Production is one EC2 host. pm2 runs six apps in fork mode, one instance each (`ecosystem.config.js`).
- Drafting already has everything chat needs:
  - the Anthropic SDK (`aux-llm.ts`, `^0.91.0`);
  - per-model rates (`llm-usage.ts` `getModelRates`, `ai.rates.<slug>`);
  - AppSettings with a 60 s cache;
  - Redis;
  - AES-256-GCM (`utils/encryption.ts`);
  - the gateway-header `authenticate`;
  - a Sentry body strip.
- `getUsdInrRate()` falls back to 85 when `finance.usd_inr` is missing. That under-counts ₹ spend by about 12% against Vikram's 96.5, so chat can't use it as is.
- `getAppSetting()` throws when a key is missing. That's good for failing closed.
- The JWT and the `x-user-plan` header carry only `free | pro`. Solo exists only in `User.planTier` (`practice`/`solo`), normalised in `credits.service.ts`. **The plan header can't gate chat.**
- `spendCap.ts` only logs, and it uses `console.warn`. Sentry's console integration turns `console.*` into breadcrumbs.
- Gateway: `/api/drafting/*` already reaches drafting through the user rate limiter (60 or 300 per minute). Nothing limits by IP on authenticated routes.
- `citation-check.ts` `removeUngivenCitations(text, given)` already applies the T-148 case-law rule.

## 1. Placement

**Decision: a module inside drafting (`apps/drafting/src/assistant/`), mounted at `/assistant`, with its own gateway mount `/api/assistant`. No new service.**

| | Route in drafting | New service |
|---|---|---|
| Deploy on one EC2 with pm2 | One line in `app.ts` | New pm2 app, port, env block, gateway proxy, `deploy.sh`, CI job, Sentry init. About 80–120 MB more RAM on a shared host |
| Reuse | Rates, AppSettings, encryption, Redis, auth, models | Copy them, or move them to `packages/shared` (hot path, one lead at a time) |
| Blast radius | Shares drafting's event loop. Chat is I/O-bound streaming at 25 users. Acceptable | Isolated |
| Erase or DPDP | Same database and runbook | Same, plus one more place to remember |

- **Assumption:** under 100 concurrent chats in Phase 1.
- **Risk:** a chat bug could crash drafting. Mitigations:
  - one route-level try/catch;
  - no synchronous CPU work (retrieval runs over a small in-memory index);
  - pm2 `autorestart` is already on.
- **Isolation rules, enforced by a test that greps imports:**
  - `assistant/**` must not import `ai.service.ts`, `drafter.prompts.ts`, `intake.prompts.ts` or `brief-drafter.ts`;
  - nothing outside `assistant/` imports from it, except `app.ts`.
- **Exit path:** if chat passes about 30% of drafting CPU, or needs its own scaling, the folder lifts out as-is into `apps/assistant`.

## 2. Model

| Setting | Value |
|---|---|
| Model id | `claude-haiku-5-5`, stored in AppSetting `ai.assistant_model`. Not in code, by the 11 May founder rule |
| Rate row | `ai.rates.claude-haiku-5-5` = `{"input_usd_per_mtok":0.10,"output_usd_per_mtok":0.50}`. **Verify** against the console before seeding. The rate is higher above 100K prompt tokens, which we never reach |
| Thinking | `thinking: {type: "disabled"}` with `output_config: {effort: "low"}`. Haiku 5.5 accepts "disabled" only at effort `high` or below, so effort must be set explicitly |
| Reply call | `max_tokens: 500`, streamed (`messages.stream`), no tools, no prefill (prefill returns 400) |
| Classifier call | Same model, `max_tokens: 10`, effort `low`, thinking disabled, not streamed |
| Refusal stop | Haiku 5.5 has no server-side fallback. `stop_reason: "refusal"` shows Ajay's refusal line |
| API key | A separate `ANTHROPIC_ASSISTANT_API_KEY` in drafting env, with a $25/month limit in the console. If the key is empty, chat is disabled (fails closed) |
| SDK | **Verify** that `^0.91.0` types accept `output_config.effort` and `thinking.disabled`. Bump only if needed: a bump touches `yarn.lock`, which is root config |

Cost check against Vikram's numbers at ₹96.5:
- typical reply: about 4,000 tokens in and 250 out, ≈ ₹0.05;
- worst case: about 6,000 in and 500 out, ≈ ₹0.08;
- classifier: about ₹0.004.

His ₹0.06 and ₹0.09 stand. **Haiku 5.5 is accepted. Haiku 4.5 is rejected (about 10x the cost).**

## 3. Guardrails (five layers, each fails closed)

Request path:
`gateway (auth, IP and user rate limit) → access and caps → (a) rules + classifier → (c) retrieval → (b)+(e) prompt assembly → model stream → (d) output filter → client`

### (a) Input classifier: rules, then Haiku

1. **Rules (no cost, deterministic), run first:**
   - NFKC-normalise the text and strip zero-width characters;
   - length caps: 2,000 characters typed, 4,000 pasted;
   - regex list: "ignore (all|previous) instructions", "system prompt", "repeat the text above", "you are now", "developer mode", role-play markers, and base64 or hex blobs over 200 characters.
   - A rule hit is `injection`. Nothing goes to the model.
2. **Haiku classifier:**
   - It sees only the latest user message, wrapped as data (see e).
   - It returns exactly one label: `law` | `lawie_help` | `drafting_help` | `full_draft` | `off_topic` | `injection`.
   - Anything else, or an error, counts as `off_topic`.
3. **Routing:**
   - `off_topic` gets Ajay's refusal line.
   - `injection` gets the same line and adds a flag.
   - `full_draft` points to the template or Ink flow, so chat doesn't become a free-draft back door.
   - The three in-scope labels continue.
4. **Flags:**
   - 3 flags in 24 h puts the user's chat on a 24 h cool-down (`asst:cool:<userId>`).
   - The report button stores that message pair (see 5).

### (b) System prompt

- One file: `assistant/prompt/system.ts`. It's legal content: Ajay signs it, and it's added to `.claude/docs/legal-content-paths.md`.
- It holds only:
  - scope;
  - persona ("Lawie Assistant");
  - the refusal and disclaimer lines;
  - the citation rules (cite only sections supplied in context; no case law unless the user gave it, T-148; old and new law per T-245);
  - the data-handling rule from (e);
  - the canary.
- It never holds:
  - model or vendor names;
  - services, routes or URLs (other than public `lawie.in` pages);
  - keys;
  - file names;
  - staff or agent names;
  - costs or roadmap.
- A leak should expose nothing exploitable. A test asserts that the prompt contains no string from the output-filter list (d), apart from the canary.

### (c) Retrieval: two sources only

1. **Help text:**
   - `assistant/help/*.md`, written by Priya and Meera. Public copy only. Ajay checks any legal claim.
   - It's chunked at boot into an in-memory keyword index (BM25-style, no embeddings, no new vendor).
   - The top 3 chunks are added to context, at most 1,500 tokens.
2. **Sections map:**
   - `config/sections/*.json` (`ipc-to-bns`, `crpc-to-bnss`, `iea-to-bsa`), read-only.
   - Section references in the message (e.g. "302 IPC", "BNSS 480") are matched by regex, and the mapping rows are added to context.
- **No other source.** No tools, browsing, database or ticket content.
- The model only sees what retrieval puts in front of it, so it can't leak code or internal docs: they're never in context.

### (d) Output filter

- **Streaming without leaking:** the server holds back text until a sentence boundary, or 120 characters. It checks the whole reply so far, then releases the checked text.
- **On a hit:**
  - stop the stream;
  - send a `retract` SSE event, and the client replaces the bubble with the refusal line;
  - count it as a flag.
- **Blocklist,** kept in `assistant/guard/output-filter.ts`:
  - **Canary:** a random 24-character string in AppSetting `chat.canary`, which is placed in the system prompt. If the setting is missing, chat refuses to run.
  - **Internal identifiers:**
    - service names as words (`gateway`, `drafting service`, `billing service`, `email-worker`, `auth service`);
    - ports `400[0-3]`;
    - `x-internal-*` and `x-user-*`;
    - AppSetting key patterns (`ai\.`, `chat\.`, `finance\.`);
    - `T-\d{3}`, `SCRUM-\d+` and `ADR-\d+`;
    - `ENCRYPTION_KEY`, `INTERNAL_SECRET` and `ANTHROPIC_`.
  - **Model and vendor names:** Claude, Anthropic, Haiku, Sonnet, Opus, GPT, OpenAI, Gemini, Helicone, MongoDB, Mongo, Redis, BullMQ, Sentry, Pino, pm2, EC2, AWS, SES, Next.js, Express.js.
  - **URLs:** any `https?://`, `www.` or bare domain, except an allowlist of public `lawie.in` paths that appear in the help text.
  - **File paths:** `apps/`, `packages/`, `src/`, `config/`, `handoff/`, `.github/`, and anything like `\w+\.(ts|js|json|md|env|yml)`.
  - **Thinking tags:** `<thinking` or similar tags.
- **Legal checks on the final text:**
  - `removeUngivenCitations` (T-148), where "given" means the user's own messages;
  - any section named must exist in `config/sections/`. If not, the reply is replaced with the "verify against the bare act" line.
  - Ajay's disclaimer line is appended by code, not left to the model.
- **Staff names are not blocked:** "Ajay" is also a common party name, and false positives would hurt. They're safe because they're never in context.

### (e) Pasted text is data

- The client sends `{message, pasted?}` as separate fields.
- The server wraps the pasted text as `<pasted_text>…</pasted_text>`, after stripping any `<`/`>` tag look-alikes from the input. The prompt says the content is a document to analyse and never instructions.
- After the user turn, the server appends a mid-conversation `system` message reminding the model of scope and the data rule. Haiku 5.5 supports this operator channel.
- **History is stored on the server only.** A client-sent history could forge assistant turns. The last 6 turns are replayed from storage.

## 4. Limits and access

All checks run in drafting, in this order, before any model call. Any lookup failure means refuse.

| # | Check | Source | On fail |
|---|---|---|---|
| 1 | `chat.enabled === "true"` | AppSetting. A missing key means off. Takes effect in ≤ 60 s (cache TTL) | 503, "Assistant is paused" |
| 2 | Paid plan | `User.planTier` normalised to `solo` or `pro`, read from Mongo, **not** the JWT or plan header. **Verify** with the billing owner that `planRenewsAt` marks a lapsed plan | 403, locked panel with upgrade message |
| 3 | Rate and FX present | `ai.rates.<slug>` priced, and `finance.usd_inr` present and > 0 (a strict reader, no 85 fallback) | 503, and a Sentry message (no content) |
| 4 | Cool-down not active | Redis `asst:cool:<userId>` | 429 |
| 5 | Daily messages | `asst:msgs:<userId>:<ISTdate>`: Solo 30, Pro 60 | 429, "Daily limit reached" |
| 6 | User monthly ₹ | `asst:inr:<userId>:<YYYYMM>` in paise: Solo ₹30, Pro ₹75 | 429 |
| 7 | Global daily ₹ | `asst:inr:all:<ISTdate>`: ₹300 | 503 for everyone, until IST midnight |
| 8 | Global monthly ₹ | `asst:inr:all:<YYYYMM>`: ₹2,000. Alerts at ₹1,000 and ₹1,600, once each (SETNX flag), as a Pino warn and a Sentry message to the founder | 503 |

- **Reserve, then settle:**
  - Before the call, add a worst-case reserve to the counters for checks 6–8: estimated input tokens (characters ÷ 3) plus 500 output tokens, at the stored rate, plus the classifier.
  - After the stream, replace the reserve with the actual cost from provider usage.
  - Checks 6–8 compare spend plus reserve against the cap.
- **Redis is fast, not the source of truth.** Each call writes a numbers-only `assistantcalls` row (Mongo). If a month counter is missing (Redis flush), it's rebuilt from Mongo before any call is allowed.
- **Edge limits (gateway):**
  - the existing per-user `planRateLimiter`;
  - a new per-IP limiter on `/api/assistant` (20 requests a minute, Redis prefix `rl:asst:ip:`).
- **Backstop:** the console's $25 (about ₹2,400) monthly limit on the separate key sits above the ₹2,000 cap.
- **Free plan:** no model call ever runs. The panel renders locked.

## 5. Logging, storage and privacy

- **Pino:**
  - The assistant router logs only ids, label, status, token counts, ₹ cost and latency.
  - Never `req.body`, the message, the reply or a retrieved chunk.
  - Add Pino `redact` for `req.body`, `*.message`, `*.content` and `*.pasted` in the assistant child logger.
  - No `console.*` in `assistant/`, enforced by an ESLint rule scoped to the folder.
- **Sentry:**
  - Drafting already strips `request.data`. T-229 adds the header allowlist.
  - Chat code never puts user text into an `Error` message, and wraps SDK errors as `AssistantError(code)`.
  - A test throws inside the route with a canary in the body, and asserts it's absent from the event and from breadcrumbs.
- **Conversation storage:** a new `assistantconversations` collection.
  - Fields: `userId`, `createdAt`, `expiresAt`, and `turns[]`. Each turn holds `role`, `label` and `text`, encrypted with the existing AES-256-GCM `encrypt()`.
  - Reported messages: a `reported: true` turn pair is kept to the reported retention.
- **Retention:**
  - **Proposal: 30 days by TTL index on `expiresAt`, and 90 days for reported pairs. Ajay decides.** Until he does, use 30 days and no exceptions.
  - The user can delete a conversation from the panel. That's a hard delete.
- **Analytics:** events carry no text, only `asst_message_sent{label}`, `asst_refused{reason}` and `asst_report`.
- **Privacy policy:** Ajay adds a line on chat: stored encrypted for 30 days, processed by our AI provider, not used for training. The web copy change goes with the T-235 policy work, not these tickets.
- **Erase runbook additions (T-235):** the ADR owner applies these to `T-235-erase-runbook.md` when 253a merges.
  - Step 1: Redis `asst:msgs:<userId>:*`, `asst:inr:<userId>:*`, `asst:cool:<userId>`, and `rl:asst:ip:*` (no userId, so wait for the 1-minute TTL).
  - Step 2: `assistantconversations {userId:U}`, `assistantcalls {userId:U}`.
  - Step 5: Anthropic is the same as today. Its retention applies to the separate key too.

## 6. Tests

| Suite | Where | What it proves | Runs |
|---|---|---|---|
| Guard fixtures | `apps/drafting/src/__tests__/fixtures/assistant/{off-topic,injection,in-scope}.json`, at least 50 each | (a) rules catch the listed attacks. Routing is correct for every classifier label, using a mocked LLM that returns recorded labels. (e) the wrapping holds against tag-breakout input | CI, drafting job, every push |
| Output-filter fixtures | `…/fixtures/assistant/leaky-replies.json`: mocked model replies containing the canary, ids, URLs, vendor names, paths, an invented section, or unrequested case law | 100% blocked or retracted. Clean replies pass | CI |
| Limits and access | Jest with Redis mock and Mongo memory server | Free gets 403. Missing rate, FX, key, canary or `chat.enabled` refuses. Each cap trips at its exact paise. Reserve and settle. Counter rebuild after a flush | CI |
| Privacy | Pino and Sentry capture | No message or reply text in logs or events | CI |
| Import fence | Static grep test | (1) isolation rules | CI |
| Real-model eval | `scripts/assistant-eval.ts` plus a GitHub Actions nightly | Off-topic refusal ≥ 98%, in-scope answered ≥ 95%, zero leaks (canary or blocklist) across the 150 prompts | Nightly on `develop_staging`, skipped when `assistant/**` is unchanged in 24 h. Separate key `ANTHROPIC_ASSISTANT_EVAL_KEY` with a $5 console limit. About ₹5 a night, outside users' caps (Vikram to note) |

- The nightly job fails loudly. A red nightly blocks Anushka's batch for chat.
- Ajay's ≥ 95% in-scope bar is judged by the eval script with a fixed rubric: refused or not. It does not grade quality.

## 7. Build split

Order: **253a + 253c in parallel → 253b → 253d (needs Rajesh's design and 253a's API contract) → 253e.**
- 253a and 253b share `apps/drafting/src/assistant/` but claim separate subfolders, and run one after the other.
- `packages/shared`: **not touched by any ticket.**

| Ticket | Scope | Files (claim) | Hot or root flags | Depends |
|---|---|---|---|---|
| **T-253a** Access, caps, storage | Route skeleton (SSE contract, returns 503 until 253b), checks 1–8, reserve and settle, `assistantcalls` and `assistantconversations` models, encryption, TTL, delete endpoint, report endpoint, strict FX reader | `apps/drafting/src/assistant/{router.ts,access/**,limits/**,store/**}`, `apps/drafting/src/models/Assistant*.model.ts`, `apps/drafting/src/app.ts` (one mount line), `apps/drafting/src/config/env.ts` (one key), tests `__tests__/assistant-{access,limits,store,privacy}.test.ts` | `apps/drafting/src/config` is hot | ADR accepted, Vikram caps |
| **T-253c** Gateway mount | `/api/assistant` mount with authChain, plan limiter and a new per-IP limiter. SSE passes through unbuffered (check against the draft stream path) | `apps/gateway/src/app.ts`, `apps/gateway/src/middleware/rateLimiter.ts`, `apps/gateway/src/__tests__/assistant-route.test.ts` | `apps/gateway` is hot. It doesn't overlap T-229's `config/sentry.ts`, but check the claim board | None |
| **T-253b** Guard pipeline and model call | Rules, classifier, retrieval index, prompt assembly and data wrapping, Haiku stream, output filter and retract, citation checks, flags and cool-down | `apps/drafting/src/assistant/{guard/**,prompt/**,retrieval/**,llm.ts,help/**}`, `__tests__/assistant-{guard,filter,retrieval,fence}.test.ts`, `__tests__/fixtures/assistant/**` | `prompt/**` is legal content: needs Ajay's signed text. `help/**` needs Priya and Meera's text | 253a. Ajay's text. Help text |
| **T-253d** Web chat panel | Panel, locked state for Free, disclaimer, polite refusal, retract handling, report button, delete conversation | `apps/web/src/components/assistant/**`, `apps/web/src/hooks/useAssistant.ts`, one mount in the app shell layout (lead names the exact file on claim) | Web has no CI job, so Anushka's browser pass is the only check | Rajesh's design, 253a contract |
| **T-253e** Nightly eval | Eval script, nightly workflow, repo secret | `apps/drafting/src/scripts/assistant-eval.ts`, `.github/workflows/assistant-eval-nightly.yml` | **`.github/` is root config: one lead at a time** | 253b |

**Non-code follow-ups (not lead tickets):**
- Ajay: the system prompt text, refusal lines, disclaimer, retention, and the privacy policy line.
- Priya and Meera: the help text.
- Arjun: add `assistant/prompt/` to `legal-content-paths.md`, and update the erase runbook.
- Founder:
  - create both API keys and set their console limits;
  - seed the AppSettings `ai.assistant_model`, `ai.rates.claude-haiku-5-5`, `finance.usd_inr=96.5`, `chat.canary` and `chat.enabled=false`;
  - flip `chat.enabled` after Anushka passes.

## 8. Risks

| Risk | Likelihood | Mitigation | Owner |
|---|---|---|---|
| A jailbreak gets past both classifier layers | Medium | Defence in depth: nothing secret is in context, the output filter retracts, flags lead to a cool-down, and the nightly eval grows with every incident | Arjun |
| Output-filter false positives (e.g. "Express" or a party named "Claude") | Medium | Only qualified forms are blocked (`Express.js`). Retracts are counted, and if they exceed 2% of replies, the list is tuned | Lead |
| Wrong or invented law reaches an advocate | Medium | Sections are checked against `config/sections/`, case law is stripped, the disclaimer is added by code, and the reply is capped at 500 tokens | Ajay |
| Chat crash or load takes down drafting | Low | Async only, a try/catch boundary, and pm2 autorestart. Lift out to a service if CPU passes 30% | Arjun |
| Redis flush resets counters, causing overspend | Low | Rebuild from `assistantcalls` before allowing calls. The console's $25 key limit is the backstop | Lead |
| A Solo user reads as Free (or the reverse) | Medium | Gate on `User.planTier` from Mongo, not the JWT. Test all 5 raw tier values | Lead |
| Kill switch lag | Low | ≤ 60 s (AppSetting TTL). For an instant stop, revoke the separate key in the console | Founder |
| Haiku 5.5 behaviour or SDK types differ from what's assumed (thinking disabled at effort `low`) | Low | One integration smoke test in the nightly eval. The model id is in an AppSetting, so a fallback needs no deploy | Lead |
| Nightly eval cost creeps | Low | Its own key with a $5 limit, and it's skipped when nothing changed | Vikram |
| Scope creep into full drafting for free | Medium | `full_draft` label, 500-token cap, redirect to the Ink flow | Priya |
| Ticket dated before v1 blockers | — | T-253 says "Not before v1 blockers unless the founder says so". Priya should confirm with the founder before 253a is assigned | Priya |

**Decision summary:** a module in drafting; `claude-haiku-5-5` with thinking disabled, effort low, 500 tokens, streamed; rules plus a Haiku classifier; retrieval only from the help text and sections; a sentence-buffered output filter with retract; Vikram's caps enforced in paise with reserve and settle, failing closed on any missing setting; encrypted storage with 30-day TTL (Ajay to confirm); 5 tickets with no `packages/shared` and one root-config touch (`.github/`, in 253e).
