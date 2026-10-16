# T-342 — Teach the intake the new s.138 dates so T-192's checks actually run

| Field  | Value |
| ------ | ----- |
| Phase  | 1 — Describe and draft |
| Owner  | Ajay (meanings, signs). Lead (build, drafting) |
| Mode   | Small fix (legal content) |
| Status | Merged into develop_staging cb8d9e5 (vishal, 13 Oct 2026). Waiting for Anushka on develop |

T-192 makes code check the s.138 dates. `apps/drafting/src/config/intake/date-meanings.json` has no entries for the dates it needs (cheque validity, return memo received, notice sent). Unless the intake asks for them, both checks stay off in practice. It fails closed, so nothing wrong is drafted; the check just never runs.

## Acceptance criteria

1. `date-meanings.json` has entries for the three dates T-192 reads, with Ajay's wording.
2. A `legal_notice_s138` intake that mentions these dates fills them, and T-192's checks run on them.
3. Tests show both checks running end to end from a description. Ajay signs the JSON diff.
