# T-275 — Section converter: label for rows with no equivalent

| Field          | Value |
| -------------- | ----- |
| Phase          | 4 — Polish and release |
| Owner          | Lead (build). Ajay (the words) |
| Mode           | Small fix (web, copy only) |
| Status         | Words signed by Ajay, 12 Oct 2026. To do. Unassigned. Raised by Shashank (T-250 review), 12 Oct 2026 |
| Depends on     | T-250 + T-255 merged; the IPC rows follow T-267 |
| Gate           | Before the production section reseed (founder-only). After the reseed the page is wrong without this |

After T-250 + T-255 is seeded, `apps/web/src/app/tools/section-converter/page.tsx` (~L333-341) shows the raw badge "repealed_no_equivalent" and "Section " with nothing after it for the 6 IEA rows that have no BSA equivalent.

## Acceptance criteria

1. Such a row shows a plain label, "Repealed — no equivalent" unless Ajay signs other words, and no empty "Section ".
2. Ajay signs the exact words. No design change (same badge, words only).
3. Manual check of one such row at 375 and 1280 px in the report (`apps/web` has no tests).

## Signed words (Ajay, 12 Oct 2026)

- Rows repealed with no equivalent (6 IEA rows now; the 38 IPC repealed rows once T-267 is seeded): badge "Repealed — no equivalent" (em dash); the empty "Section" cell shows "None" (or the cell is hidden). Never blank.
- Rows left unverified (IPC 236, 254, 292A, 376DA): badge "Not verified"; cell "Check the Gazette". Never a guessed section.
- No other words needed. Ajay signs the diff as applied.
