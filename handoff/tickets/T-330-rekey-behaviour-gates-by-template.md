# T-330 — Key the drafting behaviour gates on template id or catalogue category

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Matter context |
| Owner  | Arjun (mechanism). Ajay (it changes what is drafted; signs). Lead (build, drafting) |
| Mode   | Full chain (legal content) |
| Status | To do. Unassigned. T-240 merged 6a6cd2a, so it can start |

T-240 adds `catalogueCategory` but leaves the behaviour gates on the old `category` value. These gates are the template-engine civil contract rule, the CATEGORY prompt line, the BNS whitelist on `'criminal'`, and the ai.service criminal sanity check. Each gate changes what gets drafted.

## Acceptance criteria

1. Each gate keys on the template id or the catalogue category. Arjun picks which.
2. A test shows that no existing template drafts differently, except where Ajay signs a change.
3. Ajay signs the diff. Moved goldens go to him first.

## Rides along (Tanvi, T-240)

Intake (intake.service.ts, intake.prompts.ts) also moves to catalogueCategory here, after Mahak's T-190 merges. T-240 left intake unchanged because the LLM catalogue text is a behaviour change.
