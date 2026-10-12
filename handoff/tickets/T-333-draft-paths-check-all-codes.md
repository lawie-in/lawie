# T-333 — Template and brief draft paths check every code, not only BNS

| Field  | Value |
| ------ | ----- |
| Phase  | 1 — Legal accuracy |
| Owner  | Ajay (sees the diff). Lead (build, drafting) |
| Mode   | Small fix (legal content) |
| Status | Building: shashank, stacked on T-270 (12 Oct 2026). Developer done, tester running |

The template and brief draft paths in `apps/drafting/src/services/ai.service.ts` (~812, ~1404, ~1636) run only the BNS whitelist. BSA, BNSS, IPC, CrPC and IEA citations are checked only in the `validate()` path.

## Acceptance criteria

1. Those call sites run the full T-270 citation check (all six codes) on the generated text, in the same way `validate()` does.
2. Tests: a wrong BSA, BNSS and IPC citation in a template-path draft is flagged.
3. Ajay sees the diff. Moved goldens go to him.
