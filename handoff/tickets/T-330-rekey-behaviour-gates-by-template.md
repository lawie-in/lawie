# T-330 — Key the drafting behaviour gates on template id or catalogue category

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Matter context |
| Owner  | Arjun (mechanism). Ajay (it changes what is drafted; signs). Lead (build, drafting) |
| Mode   | Full chain (legal content) |
| Status | To do. Unassigned. After T-240. Asked for by Arjun in T-240, 12 Oct 2026 |

T-240 adds `catalogueCategory` but leaves the behaviour gates on the old `category` value. These gates are the template-engine civil contract rule, the CATEGORY prompt line, the BNS whitelist on `'criminal'`, and the ai.service criminal sanity check. Each gate changes what gets drafted.

## Acceptance criteria

1. Each gate keys on the template id or the catalogue category. Arjun picks which.
2. A test shows that no existing template drafts differently, except where Ajay signs a change.
3. Ajay signs the diff. Moved goldens go to him first.
