# T-432: template form loses everything typed when the user is sent back to it

| Field  | Value                                                           |
| ------ | --------------------------------------------------------------- |
| Status | Todo. Kunal, after T-115b. Priya, 14 Oct 2026                   |
| Owner  | Kunal (build)                                                   |
| Mode   | Small fix (web)                                                 |

## Problem

Found by Kunal's developer during T-388 (14 Oct 2026); existed before T-388. Must-fix under Arjun's rule (a user-visible loss of typed data). On the template-form page (apps/web/src/app/dashboard/new/page.tsx), any return to the form (privacy re-acceptance block, the 402 paywall, the verify-email bounce) remounts DynamicFormRenderer, so the form empties and the user is back at step 1.

## Acceptance criteria

1. Returning to the form from the privacy block, the paywall or the verify-email bounce keeps every answer and the current step.
2. Tests for each of the three return paths.
3. Nothing typed is written to browser storage beyond the session (no case details persisted in localStorage).

## Added 14 Oct (from T-388's AC4 screenshots; user-visible, so must-fix, same lead and flow)

4. Form Generate, blocked state at 375 px: the button no longer runs into Cancel.
5. Soft-warn card, blocked: the cost notice shows once, not twice.
6. Blocked retry: only one control is called "Try again" (the disabled retry button and the re-fetch link get distinct labels; Meera/Madhuri word the second).
