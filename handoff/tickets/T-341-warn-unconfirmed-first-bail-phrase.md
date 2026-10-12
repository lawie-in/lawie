# T-341 — Warn when a draft says "first bail application" without a confirmed fact

| Field  | Value |
| ------ | ----- |
| Phase  | 1 — Describe and draft. Before release (Ajay) |
| Owner  | Ajay (rule, wording). Lead (build, drafting) |
| Mode   | Small fix (legal content) |
| Status | Merged into develop_staging 08103ec (12 Oct 2026). Ajay signed 479dc1d + dad223c. Anushka tests on develop |

T-336 stops the brief from asserting "no earlier bail application" until the advocate confirms it. The model can still write it from a paraphrased "none" in the raw description. This adds a check after the draft is made.

## Acceptance criteria

1. After drafting, if the draft contains any `first_bail_application` phrase and `earlier_bail_applications` is not a confirmed fact, the advocate sees a warning. It does not block the draft.
2. Works with `feature.fact_ledger` on and off.
3. Warning text, exact: "The draft says no earlier bail application was made, but this was not confirmed. Check before filing."
4. Tests for both flag states, a confirmed fact (no warning), and a paraphrased "none" in the description. Ajay sees the diff.
