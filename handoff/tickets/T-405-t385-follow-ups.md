# T-405 — T-385 follow-ups: wider test loop, one shared field allowlist

| Field  | Value                                                               |
| ------ | ------------------------------------------------------------------- |
| Phase  | 5 — After v1                                                        |
| Owner  | Lead (drafting)                                                     |
| Mode   | Small fix                                                           |
| Status | Building. Mahak, while T-390 waits for the slot. Priya, 13 Oct 2026 |
| Source | T-385 review (01503b2)                                              |

## Acceptance criteria

1. The value-preservation loop in `apps/drafting/src/__tests__/t385-public-template.test.ts` (~:432) runs over every template config, not 3.
2. `buildQuestions` in `apps/drafting/src/services/intake.service.ts` (~:581) uses the shared public-field helper from T-385 (`utils/publicTemplateConfig.ts`) instead of its own allowlist. Output is unchanged, and a test pins that.
3. If Arjun does not accept T-385's fallback for his ruling 1(b), add a projected bail_regular fixture to the web renderer tests.
