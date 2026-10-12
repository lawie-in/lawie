# T-271 — Privacy page: table keyboard focus and meta description

| Field          | Value |
| -------------- | ----- |
| Phase          | 4 — Polish and release |
| Owner          | Lead (build) |
| Mode           | Small fix (web) |
| Status         | Merged into develop_staging (0e965e7), waiting for Anushka on develop |

On phones the scroll box around the section 5 table on `/privacy` cannot be reached with a keyboard. Add `tabIndex={0}`, `role="region"` and `aria-labelledby` (pointing at the section heading) to the scroll wrapper. No text change to the page body.

Also, in the same file, replace the meta description (it says Lawie "protects your data", a promise we cannot back) with Ajay's signed string, exact, 12 Oct 2026:

`What Lawie collects, why, who receives it, and your rights under the Digital Personal Data Protection Act, 2023.`

The hero subtitle stays as it is (Ajay: fine).

File: `apps/web/src/app/(marketing)/privacy/page.tsx` (after T-235 merges).

## Acceptance criteria

1. Tab reaches the table's scroll box, and arrow keys scroll it.
2. The page body text is word for word unchanged (Ajay's signed text).
3. The meta description is exactly Ajay's string above. Ajay signs the diff as applied.
