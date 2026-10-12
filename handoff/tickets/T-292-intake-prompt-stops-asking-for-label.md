# T-292 — Intake prompt stops asking the model for a matter label

| Field          | Value |
| -------------- | ----- |
| Phase          | 4 — Polish and release |
| Owner          | Ajay (signs the prompt change). Lead (build). Arjun if the output shape changes |
| Mode           | Small fix, legal content (`intake.prompts.ts`) |
| Status         | Building: mahak (12 Oct 2026). Ajay signs the diff |

T-115e stops storing the matter label and maps the category to a fixed list. The intake prompt in `apps/drafting/src/services/intake.prompts.ts` (path to be confirmed by the lead) still asks the model for a label, which is then thrown away. Remove that ask so the model is not told to produce a matter label at all.

## Acceptance criteria

1. The intake prompt no longer asks for a label. The category stays, from the fixed list.
2. Nothing else in the prompt changes. Ajay signs the diff as applied; moved golden snapshots go to him.
3. Tests still pass; one test shows no label is requested or read.

## Follow-up (mahak review, 12 Oct 2026, test only, non-blocking)

- In the t292 POST /intake test: assert on the system prompt itself (JSON.stringify escapes quotes, so "label" can never match), and put a label in the mocked reply to prove the route does not read it. Both are covered at unit level today.
