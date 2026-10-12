# T-278 — Web bail checker: show the "no BNS equivalent" note

| Field          | Value |
| -------------- | ----- |
| Phase          | 4 — Polish and release |
| Owner          | Lead (build). Ajay (the words, already signed) |
| Mode           | Small fix (web) |
| Status         | To do. Unassigned. Raised by Shashank (T-267), 12 Oct 2026 |
| Depends on     | T-267 merged |

After T-267, the bail-check API returns a `note` for an IPC section that has no BNS equivalent ("No BNS equivalent. Check the Gazette"). `apps/web/src/app/tools/bail-checker/page.tsx` does not render the `note` field, so the user sees nothing for those sections.

## Acceptance criteria

1. An IPC section with no BNS equivalent shows the note text from the API, not an empty result and not a guessed BNS section.
2. Ajay's words are used exactly as they come from the API; the page adds none.
3. Manual check at 375 and 1280 px in the report (`apps/web` has no tests).
