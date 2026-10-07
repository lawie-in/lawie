# T-401 — One consistent flow, end to end

| Field      | Value                      |
| ---------- | -------------------------- |
| Phase      | 4 — Polish and v1          |
| Owner      | Vishal, Rajesh reviews     |
| Mode       | Full chain                 |
| Status     | Blocked: Phases 1 to 3     |
| Depends on | T-104, T-106, T-203, T-301 |
| Branch     | feature/t-401-flow-polish  |
| Created    | 2026-10-03                 |

## Goal

Describe, confirm, choose length, draft: one path with no dead ends.

## Context

- Founder goal 3: the experience should be smooth and not confusing.

## Acceptance criteria

- A new user reaches a generated draft from New document without visiting the template gallery.
- Every error and empty state has plain wording and a next step.
- Loading states exist for intake, questions and generation.
- The old "pick a template, fill the form" path still works from Browse templates.
- No screen shows internal ids, config text or routing words.
- Rajesh signs off against the T-005 design.
- `apps/web` has no tests and is not in CI. The PR includes a checked list of manual checks with screenshots at 360 px and at desktop width, and `yarn workspace @lawie/web build` passes.

## In scope

- `apps/web/src/app/dashboard/`

## Out of scope

- New features

## References

- Design: T-005
- ADR: Not needed
- Legal sign-off: Not needed

## Review, 3 Oct 2026

| Reviewer | Verdict               | Note                      |
| -------- | --------------------- | ------------------------- |
| Arjun    | Approved with changes | Manual-check rule added.  |
| Rajesh   | Approved              | I sign off against T-005. |
