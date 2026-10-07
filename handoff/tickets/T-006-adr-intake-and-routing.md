# T-006 — ADR for intake and routing

| Field      | Value                                                                |
| ---------- | -------------------------------------------------------------------- |
| Phase      | 0 — Prep                                                             |
| Owner      | Arjun                                                                |
| Mode       | Architecture decision, not through the dev lead                      |
| Status     | Done. ADR-019 approved by the founder on 4 Oct 2026 with two changes |
| Depends on | None                                                                 |
| Branch     | None                                                                 |
| Created    | 2026-10-03                                                           |

## Goal

One written decision on how free text becomes a filled template, so the intake tickets can start.

## Context

- A search of `develop`, `main` and the current branch finds no code for DraftingModeRouter, open-draft mode or demand capture. SCRUM-106 and SCRUM-107 were decided in June but are not in the repo.
- Notion has BUILD SPEC v2 (24 June, chat-first drafting, silent routing) under Dev Communication, inputToDev. Reuse it as the base.
- Standing rules: the open-mode allowlist is the safety gate, never a denylist. Unknown document types go to demand capture. The real risk is the classifier wrongly placing a document inside the allowlist.
- If the Helicone gateway is switched on, request bodies pass through a third party. Images of FIRs carry personal data.
- The preflight check (`preflight.service.ts`) already makes a cheap-model call with its own setting, `ai.preflight_model`. Intake can follow that pattern.
- The Helicone path speaks the OpenAI message format, so image input needs a different message shape there, or image requests go direct to Anthropic.
- The daily spend cap (`middleware/spendCap.ts`) only logs and reads a cost that is always 0 today.
- Request size is capped at 10 MB by production nginx and by the drafting service.
- `Generation.docType` is a required enum, so intake usage needs its own record or a schema change.

## Acceptance criteria

- The ADR fixes the intake endpoint shape: input, output, and error cases.
- It says how text is matched to a template id, what happens at low confidence, and that unknown types go to demand capture.
- It says how fields are filled and validated against `form_schema`.
- It names the model for intake and a token cap per intake call.
- It says whether images are held in memory only or stored, and for how long.
- It says whether image requests may go through Helicone.
- It says where demand signals are stored (an `Event` model already exists).
- It sets rate limits and what the user sees when intake fails.
- It covers the one-way balance migration in T-201, or says a second ADR is needed.
- The ADR is saved at `docs/adr/ADR-001-intake-and-routing.md` and linked from T-101, T-102, T-201 and T-301.
- It includes the intake rules Ajay has approved (the allowlist and the fields that are never guessed). That approval is the legal sign-off reference for T-101 and T-102.

## In scope

- The decision document only

## Out of scope

- Writing code
- RAG or citation retrieval (Phase 3 of the older roadmap)

## References

- Design: Not needed
- ADR: `docs/adr/ADR-019-intake-and-routing.md`, approved by the founder on 4 Oct 2026. Follow-ups: T-105 to T-109, and ADR-020 for the T-201 migration
- Legal sign-off: Not needed

## Review, 3 Oct 2026

| Reviewer | Verdict               | Note                                                                                                                                                                                                                               |
| -------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arjun    | Approved              | Mine to deliver. Can start now. It also has to cover the T-201 migration.                                                                                                                                                          |
| Ajay     | Approved              | I co-sign the intake rules inside the ADR.                                                                                                                                                                                         |
| Arjun    | ADR written           | Saved as ADR-019 with three diagrams. The T-201 balance migration gets its own ADR (ADR-020), as the ticket allows.                                                                                                                |
| Priya    | Reviewed              | Scope matches T-101, T-102 and T-301. Three follow-ups: T-102 needs no model call, T-101 needs no gateway change, and open draft needs a new ticket (T-105) if the founder says yes to D1. Six decisions are open for the founder. |
| Founder  | Approved with changes | D1, D3, D5 and D6 approved. D2 changed: no dead end, a guided draft through Reception, Drafter and Reviewer. D4 approved on condition that cost does not rise sharply.                                                             |
| Ajay     | Signed 4.1 and 4.2    | The value and matching rules for the template route are signed. Section 4.3 (guided draft) is not signed until the prompts exist (T-107).                                                                                          |
