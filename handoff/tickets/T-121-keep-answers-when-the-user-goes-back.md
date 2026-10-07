# T-121 — Keep the user's answers when they go back to the description

| Field      | Value                                                                                               |
| ---------- | --------------------------------------------------------------------------------------------------- |
| Phase      | 1 — Describe-first intake                                                                           |
| Owner      | Vishal                                                                                              |
| Mode       | Web change, manual checks (`apps/web` has no tests)                                                 |
| Status     | Closed on 5 Oct 2026, not built. ADR-021 is approved; its work is in T-105 (server) and T-125 (web) |
| Depends on | None                                                                                                |
| Branch     | fix/t-121-keep-intake-answers                                                                       |
| Created    | 2026-10-05                                                                                          |

## Goal

Nothing the user typed is lost when they go back to edit the description and come forward again.

## Context

- Finding 3, reported by the founder on 5 Oct 2026, `handoff/manual-checks/T-103-T-104-e2e-result.md`.
- On the follow-up screen the user types answers, clicks Edit, presses Continue, and the answers are gone. Values typed on the review screen are lost the same way after "Edit my description".
- Cause: `FollowUpStep` (`apps/web/src/components/intake/FollowUpStep.tsx`) keeps answers in its own state, so they go when the screen closes. `backToDescribe` in `apps/web/src/app/dashboard/new/page.tsx` saves nothing. Review values are saved only on "Not this document?" (`carryOverRef`).
- Each trip back also makes a new describe call, which counts against the limit of 10 in 10 minutes.
- The description text itself is kept. Step 10 of the test plan checks only that.

## Acceptance criteria

- Follow-up answers are still there after Edit and Continue, when the same document is matched again.
- Values typed or changed on the review screen are still there after "Edit my description" and Continue.
- If the new description matches a different document, values for fields with the same id are carried over, as "Not this document?" does today. The rest are dropped without an error.
- If the user presses Continue without changing the description, no new describe call is made. The earlier result is shown again.
- A value the user typed is never replaced by a value the model fills on the second pass.
- Nothing is kept after the draft is generated, after Cancel, or after the user leaves the page. Case details are not written to browser storage.
- `handoff/manual-checks/T-103-T-104-e2e-plan.md`, step 10, also checks that follow-up answers and review values are kept. The headless check script covers it.
- Checked by hand at desktop width and at a narrow width, with screenshots in the pull request.

## In scope

- `apps/web/src/app/dashboard/new/page.tsx`
- `apps/web/src/components/intake/FollowUpStep.tsx`
- `handoff/manual-checks/`

## Out of scope

- Saving a half-finished matter as a draft to come back to later
- Any backend change

## References

- Design: `handoff/design/T-005-describe-first-flow-spec.md`. No new screen
- ADR: Not needed
- Legal sign-off: Not needed
