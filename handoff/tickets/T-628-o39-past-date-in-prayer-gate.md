# T-628: A past date in the O.39 prayer is a gate finding

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (legal; ships with T-613) |
| Owner  | vishal, straight after T-611 |
| Mode   | Full chain; legal (ai.service.ts gate) |
| Status | Merged into develop_staging b2e91054, 27 Oct 2026 (CI pending). Ships with T-613 and T-629. Priya |

## Acceptance criteria
1. A date before today (IST) in {restraint_sought} or anywhere in the prayer of a temporary_injunction_o39 draft is a blocking finding, code `past_date_in_prayer`, through withholdDraft on both paths.
2. The user sees Ajay's signed question (T-613 file §h, EN and HI). <date> is shown to the user only and never logged.
3. The answer replaces restraint_sought. No delivery and no Ink until it is answered.
4. Tests: past date, today, future date, no date; Anushka's "20 October 2026" case.
5. Ships with T-613 and T-629 (release checklist).
