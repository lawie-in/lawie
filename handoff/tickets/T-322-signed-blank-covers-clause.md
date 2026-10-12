# T-322 — A signed blank covers its clause (no repair call)

| Field  | Value |
| ------ | ----- |
| Phase  | 1 — Bail drafting |
| Owner  | Ajay (ruled 12 Oct 2026). Lead (build, drafting) |
| Mode   | Small fix (legal content; Ajay sees the diff) |
| Status | Building: vishal (12 Oct 2026) |

`apps/drafting/src/services/brief-drafter.ts`, rule R2b.5 (~line 863), counts a clause as missing when its paragraph is only the signed blank, and then runs a repair call. Example: anticipatory `apprehension` with "[To be confirmed: the facts on which the applicant apprehends arrest]".

## Acceptance criteria (Ajay)

1. A paragraph holding the exact signed blank for a clause covers that clause. This applies to anticipatory `apprehension` and to any clause whose signed text prescribes a blank. No repair runs.
2. Only the exact signed blank counts. Other "[To be confirmed" text does not.
3. A test shows a blank-only paragraph triggers no repair, and a near-miss blank still does.
