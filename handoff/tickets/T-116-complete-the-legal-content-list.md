# T-116 — Complete the legal-content list

| Field      | Value                                        |
| ---------- | -------------------------------------------- |
| Phase      | 0 — Prep                                     |
| Owner      | Vishal (agent files), Ajay confirms the list |
| Mode       | Config change, outside the crew chain        |
| Status     | Ready                                        |
| Depends on | None                                         |
| Branch     | chore/t-116-legal-content-paths              |
| Created    | 2026-10-04                                   |

## Goal

Every file that holds a drafting prompt asks for Ajay's sign-off when it changes.

## Context

- Found in T-206. `.claude/docs/legal-content-paths.md` lists `ai.service.ts` and `preflight.service.ts`, but the drafting system prompt is built in `template-engine.service.ts` (`buildAISystemPrompt`, `buildAIUserPrompt`).
- Prompts are also assembled in `prompt-assembler.ts` and `template-promoter.ts`. None of the three is on the list.
- New prompt files are coming: `intake.prompts.ts` (T-101), the guided-draft prompts (T-106) and the review prompt (T-111).

## Acceptance criteria

- The list includes `template-engine.service.ts`, `prompt-assembler.ts` and `template-promoter.ts`.
- It says that any new file holding a prompt is legal content from the day it is created.
- The gate text in `.claude/agents/vishal.md` still points to the list.

## In scope

- `.claude/docs/legal-content-paths.md`

## Out of scope

- Any change to a prompt

## References

- Design: Not needed
- ADR: Not needed
- Legal sign-off: Not needed
