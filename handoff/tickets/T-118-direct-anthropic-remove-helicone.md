# T-118 — Call Anthropic directly and remove Helicone

| Field      | Value                                                                                                                   |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| Phase      | 0 — Prep                                                                                                                |
| Owner      | Vishal, Arjun reviews. One account step for the founder                                                                 |
| Mode       | Full chain                                                                                                              |
| Status     | Ready. Step 1 before the T-004 batch. Step 2 after the backend pull request lands                                       |
| Depends on | T-117 for the order only. Step 2 waits for the backend pull request (T-110, T-101, T-102), which touches the same files |
| Branch     | feature/t-118-direct-anthropic                                                                                          |
| Created    | 2026-10-04                                                                                                              |

## Goal

Every model call goes straight to Anthropic. No Helicone code, key or header is left.

## Context

- Founder decision, 4 Oct 2026, 13:56: no Helicone in the middle. It replaces "production uses Helicone only" of 3 Oct 2026.
- What the repo showed on 4 Oct 2026 (values not printed):
  - `HELICONE_API_KEY` is set in `.env`, `.env.development` and `.env.production`. It is the same key in all three, a US-region key.
  - When that key is set, `streamLLM` in `ai.service.ts` and `callAux` in `aux-llm.ts` send the call to `ai-gateway.helicone.ai`. So every environment has been calling through Helicone, production included.
  - `ANTHROPIC_API_KEY` is also set in all three files. With the Helicone key empty, the code already takes the direct path.
- The Helicone dashboard for `admin@lawie.in` (US) shows 0 requests for 27 Sep to 4 Oct, although drafts worked in that week. So the key belongs to a different Helicone organisation or login. Draft text has been going to an account nobody on the team is looking at.
- Usage capture on the direct path is already built and tested in T-003 (`message_start` and `message_delta`). The one real draft that verified T-003 very likely went through Helicone, so the direct path still needs one real draft.
- With Helicone gone, the rule "the model must be a full dated id" goes too. It was a Helicone limit.

## Acceptance criteria

**Step 1, switch (settings only, no code)**

- `HELICONE_API_KEY` is empty in the three env files, and production is redeployed.
- One real draft in each of dev and production writes a `Generation` row with `transport: direct`, `usageSource: provider` and real token counts.

**Step 2, remove the code**

- The Helicone branch is gone from `streamLLM` and from `callAux`, with `heliconeHeaders`, the Helicone error parsing and the two env vars in `apps/drafting/src/config/env.ts`.
- The OpenAI-style stream parser in `llm-usage.ts` is removed if nothing else uses it.
- `Generation.transport` keeps `helicone` as an allowed value so old rows still load. New rows always say `direct`.
- `runId`, `runSequence` and `runType` stay in the database and in log lines. Only the Helicone headers go. This replaces the Helicone-header criterion in T-110.
- `helicone.test.ts` is deleted and the other suites are updated. The drafting suite is green.
- No prompt text changes.
- `grep -ri helicone apps packages` returns only the `transport` enum and its comment.

**Step 3, close the account (founder)**

- Find the Helicone organisation that owns the key: the organisation switcher on helicone.ai, or another login.
- Delete the stored requests there and revoke the key.
- If it cannot be found, write that here. The key stops being used after step 1 either way.

**Records**

- Arjun writes in this file how long Anthropic keeps request data, whether it is used for training, and where it is stored. This item moved here from T-114.

## In scope

- `apps/drafting/src/services/ai.service.ts` (transport code only)
- `apps/drafting/src/services/aux-llm.ts`
- `apps/drafting/src/services/llm-usage.ts`
- `apps/drafting/src/config/env.ts`
- `apps/drafting/src/models/Generation.model.ts` (comment only)
- The drafting tests that mention Helicone
- The three env files (not in git)

## Out of scope

- Any prompt text
- Ink, drops and what the user pays
- A replacement monitoring tool. Cost is read from `Generation` rows and the Anthropic Console.

## References

- Design: `handoff/design/T-003-token-usage-design.md`, addendum of 4 Oct 2026
- ADR: Not needed
- Legal sign-off: Given by Ajay on 4 Oct 2026 for the transport code in `ai.service.ts` only. Void if any prompt text changes
- Replaces: T-114
