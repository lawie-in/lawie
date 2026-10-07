# T-101 — Intake API: description to filled template

| Field      | Value                                                                                                                                                                                               |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase      | 1 — Describe-first intake                                                                                                                                                                           |
| Owner      | Vishal                                                                                                                                                                                              |
| Mode       | Full chain                                                                                                                                                                                          |
| Status     | Built 4 Oct 2026, drafting suite green (2811 tests), one live Haiku check passed. Ajay read the prompts on 4 Oct 2026: approved, with one change in `intake.service.ts` before merge. Not committed |
| Depends on | None open. T-001, T-003 and T-006 are done                                                                                                                                                          |
| Branch     | feature/t-101-intake-api                                                                                                                                                                            |
| Created    | 2026-10-03                                                                                                                                                                                          |

## Goal

The user describes a matter in their own words and the system returns the matching template with as many fields filled as it can.

## Context

- Today the user picks one of 92 templates and fills a long form. Templates stay as the hidden backend. Each file in `apps/drafting/src/config/document-rules/` has a `form_schema`.
- There is no intake, router or guided-draft code in the repo yet (see ADR-019).
- The existing generation pipeline is `streamGenerateFromTemplate` in `apps/drafting/src/services/ai.service.ts`. It stays as it is and receives the filled fields.
- Standing rule: no Anthropic call is added without rate-limit and cost guards.
- The preflight check (`preflight.service.ts`) already makes a cheap-model call with its own model setting. Intake can follow that pattern.
- The daily spend cap only logs and never blocks, so it does not protect intake.
- ADR-019 design: two model calls (match, then fill), every value backed by a quote from the description, usage saved in a new `LlmAuxCall` collection, and an `intakeId` linked to the `runId`.
- The route sits under `/documents`, which the gateway already proxies, so no gateway change is needed.
- Model is final: Haiku for intake, set in `ai.intake_model` as a full dated model id.

## Acceptance criteria

- A new endpoint takes the description text and returns: the matched template id or "no match", the filled field values, and the list of required fields still missing.
- Only templates on the allowlist can be matched. Anything else returns "no match" and records a demand signal.
- Low-confidence matches behave as the ADR says.
- Filled values are checked against `form_schema` types. Invalid values are dropped and listed as missing.
- The response never tells the user which mode or route was chosen.
- There is a rate limit per user, a hard daily cap on intake calls that returns an error when reached, and a token cap per call.
- Each intake call records its tokens and cost, in the way the ADR decides.
- Intake does not spend drops. The 50-drop base at generation covers it.
- No description text or extracted personal data is written to logs or third-party tools.
- Tests cover: match, no match, missing fields, invalid values, and the rate limit.
- When no template fits, the response is `outcome: guided`. Until T-105 ships, the web app treats that as no match.

## In scope

- `apps/drafting`: a new route and service
- The usage record the ADR chooses for intake calls
- No gateway change (the route sits under `/documents`)

## Out of scope

- Images and PDFs (T-301, T-304)
- Follow-up questions (T-102)
- Any change to the generation prompts

## References

- Design: Not needed
- ADR: `docs/adr/ADR-019-intake-and-routing.md`, approved by the founder on 4 Oct 2026
- Legal sign-off: Signed: ADR-019 sections 4.1 and 4.2, Ajay, 4 Oct 2026. Prompt text in `intake.prompts.ts` read and approved by Ajay on 4 Oct 2026 (see "Ajay's read of the prompts")

## Review, 3 Oct 2026

| Reviewer | Verdict               | Note                                                                                                                  |
| -------- | --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Arjun    | Approved with changes | Feasible. Usage recording and the hard cap are corrected above. Starts after the ADR.                                 |
| Ajay     | Conditional           | I cannot sign a prompt that does not exist. My sign-off comes through the ADR rules, then a read of the final prompt. |
| Priya    | Approved              | Scope is right.                                                                                                       |

## Build note (Vishal, 4 Oct 2026)

**What exists now**

- `POST /documents/intake` (drafting route `/intake`) in `apps/drafting/src/routes/intake.routes.ts`. Logic is in `services/intake.service.ts`, prompts in `services/intake.prompts.ts` (added to the legal-content list), and the model call in `services/aux-llm.ts` (holds no prompt text).
- Outcomes are `matched`, `needs_choice`, `guided`, `no_match` and `unavailable`, as in ADR §3.3. No route, mode or confidence is in the response.
- After `needs_choice`, the web resends the same request with the picked `template_id` and the `intake_id`. That runs only the fill call. ADR §3.3 did not name this request shape, so this is my reading of it.
- Every value needs a quote that appears in the description. On top of that, code checks that the value matches it:
  - text: the user's own words, cuts allowed only with an ellipsis
  - numbers: the whole number appears in the quote
  - dates: read from the quote by code, day first
  - choices: a valid option id
  - a field given two different values is dropped
- Courts-data fields, `police_station` and other court-like ids are never offered to the model or accepted from it. `language` comes from the request.
- Limits are counted in Redis: 10 per 10 minutes, and 40 a day on Free or 150 a day on paid plans (IST day). A breach is a 429 with `Retry-After`. If Redis is down, intake is `unavailable` and no model call is made.
- Output caps are 300 tokens (match) and 1,500 (fill). `ai.intake_model` must be a dated id, otherwise `unavailable`.
- Usage: one `LlmAuxCall` row per call (`intake_match`, `intake_fill`), priced with T-003's rates, completed or failed, with numbers only. `generate-from-template` accepts `intake_id` and stores it on the `Generation` row.
- Demand signals in `Event`: `demand.no_template` when the outcome is `guided`, `demand.no_match` when the model named an unknown id or replied malformed. The label is generic, with digits stripped by code. No description is stored.
- Spends no Ink.

**Verified**

- `apps/drafting/src/__tests__/intake.test.ts`, 25 tests: match, choice, guided, no match, missing, invalid values, burst and daily limits, unavailable, usage rows, no description text in logs, `intake_id` on Generation.
- One live run on `claude-haiku-4-5-20251001`, direct path, invented description, throwaway database:
  - bail description: `bail_regular`, 10 values kept
  - consent letter: `guided`
  - cricket bat: `no_match`
  - about 4,800 input tokens per match call, about $0.009 per intake at Haiku list price. ADR §3.8 estimated under one rupee.

**Assumptions to confirm**

1. **"Allowlist" = the active template catalogue.** Nothing else in the repo defines one. If Ajay wants a narrower list, it is one filter in `getCatalogue()`.
2. `demand.no_template` is written at intake. When T-105/T-106 ship, they must not write a second one for the same `intakeId`.
3. `guided` returns `questions: []` until T-105 (Reception).
4. Helicone omit headers (`Helicone-Omit-Request` and `-Response`) are set so the description is not stored there. **Not verified on the AI Gateway path.** No longer needed once T-118 removes Helicone.

**Open before merge**

- ~~Ajay reads `intake.prompts.ts`.~~ Done 4 Oct 2026. One change before merge, below.
- `ai.intake_model` and `ai.rates.claude-haiku-4-5-20251001` must be seeded in each environment.

## Ajay's read of the prompts (4 Oct 2026)

Read: `apps/drafting/src/services/intake.prompts.ts` as it stands in the working tree, and the checks in `intake.service.ts` that enforce it.

**Verdict: the prompt text is approved as written.** It may merge once the one change below is in. Any later change to the prompt text needs a new read.

| Rule (ADR-019)                                 | In the prompt                | Enforced by the server                                                       |
| ---------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------- |
| 4.1.1 only what the user states                | Yes                          | Quote must appear in the description                                         |
| 4.1.2 never court, district, police station    | Not sent to the model at all | `isModelFillable`, and dropped if returned                                   |
| 4.1.3 quote for names, numbers, dates, amounts | Yes                          | Numbers and dates are checked inside the quote. Text is not (see the change) |
| 4.1.4 old-law sections passed through          | Yes                          | Value must be in the quote as written                                        |
| 4.1.5 contradiction leaves the field empty     | Yes                          | Duplicate entries are dropped                                                |
| 4.2.2 medium always asks                       | Yes                          | `needs_choice`                                                               |
| 4.2.3 malformed or unknown is no match         | Yes                          | `no_match`                                                                   |

**One change before merge (Vishal, in `intake.service.ts`, not in the prompt):**

- For `text` and `textarea` fields the server checks that the value is the user's own words anywhere in the description. It does not check that the value sits inside its own quote. So a real name from one sentence can land in the wrong field, for example the opposite party's name as the applicant. Rule 4.1.3 says a name is filled only with a matching quote. Check the value against the quote, as numbers and dates already are, and add a test for a name taken from outside its quote.

**Carried to T-105, not blocking this merge:**

- The match prompt lists court signals in English only. For the guided route the server must apply the English and Hindi signal list from T-107 itself, and not rely on the model's `is_court_document`.
- `cleanLabel` removes digits but not names. The label is stored as a demand signal, so a person's name can be stored if the model ignores the rule. Tighten it or stop storing the label before users arrive.
