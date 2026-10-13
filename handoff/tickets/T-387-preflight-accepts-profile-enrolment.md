# T-387 — Pre-filing check accepts the enrolment number from the profile

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (drafting) + Ajay (rule) + Arjun |
| Mode   | Small fix |
| Status | To do. Ajay ruled yes (13 Oct 2026). Mahak, after T-365/T-382 merges (she holds preflight.service.ts) |
| Source | Preflight F4 hard-blocks a vakalatnama whose enrolment field is empty, even when the advocate's profile has an enrolment number that the draft prints (T-311) |

## Acceptance criteria (Ajay, 13 Oct 2026)

1. F4 checks the enrolment number the vakalatnama will actually print: the T-311 resolved value (the profile number, or the typed number when the profile is empty). F4 passes if that value is non-empty, and blocks if both are empty.
2. F4 and the renderer read the same resolver, so the check can never pass on a number the draft won't print.
3. No format check is added here.
4. Tests: profile only, typed only, both empty (blocks).
