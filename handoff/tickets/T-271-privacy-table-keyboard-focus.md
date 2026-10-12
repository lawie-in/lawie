# T-271 — Privacy page: make the section 5 table scroll box keyboard-focusable

| Field          | Value |
| -------------- | ----- |
| Phase          | 4 — Polish and release |
| Owner          | Lead (build) |
| Mode           | Small fix (web) |
| Status         | To do. Unassigned. Reviewer finding on T-235, 12 Oct 2026 |

On phones the scroll box around the section 5 table on `/privacy` cannot be reached with a keyboard. Add `tabIndex={0}`, `role="region"` and `aria-labelledby` (pointing at the section heading) to the scroll wrapper. No text change.

File: `apps/web/src/app/(marketing)/privacy/page.tsx` (after T-235 merges).

## Acceptance criteria

1. Tab reaches the table's scroll box, and arrow keys scroll it.
2. The page text is word for word unchanged (Ajay's signed text).
