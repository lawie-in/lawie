# T-365 — Brief and template picker: Not known, advocate name, browse, Use template

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (web + drafting) |
| Mode   | Full chain |
| Status | To do. RELEASE GATE for main (Anushka FAIL). Unassigned. Priya, 13 Oct 2026 |
| Source | Anushka run 3 FAIL, 13 Oct 2026 (handoff/quality/2026-10-13-run-3-develop-FAIL.md). Failed entries: T-300, T-190, T-199, T-240, T-290, T-309, T-318 |

## Acceptance criteria

1. With the advocate name field empty, drafts print the profile name ("Abhi"), not "[To be confirmed: advocate name]".
2. On the brief, pressing "Not known" selects it; it does not clear the row (investigation stage, named in FIR, cooperation).
3. Anticipatory bail asks about the Section 35 notice and recovery (Ajay's wording, already signed for T-190/T-199 if present; else ask him).
4. "Browse document types" is grouped like the templates library.
5. "Use template →" opens the chosen template, so the section picker is reachable (unblocks T-290, T-309, T-295, T-324, T-291).
6. No card shows internal text such as "Document-rules config for default_bail".
7. Find out why no Vakalatnama or Memo of Parties was produced (T-313, T-318). Fix it here if it's a bug; tell Priya if it's a setting.

Anushka's reproduce steps are in the run 3 report; use them as the test cases. Anushka re-tests on develop after merge.
