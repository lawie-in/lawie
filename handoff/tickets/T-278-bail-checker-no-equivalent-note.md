# T-278 — Web bail checker: show the "no BNS equivalent" note

| Field          | Value |
| -------------- | ----- |
| Phase          | 4 — Polish and release |
| Owner          | Lead (build). Ajay (the words, already signed) |
| Mode           | Small fix (web) |
| Status         | Building: shashank (12 Oct 2026) |
| Depends on     | T-267 merged |

After T-267, the bail-check API returns a `note` for an IPC section that has no BNS equivalent ("No BNS equivalent. Check the Gazette"). `apps/web/src/app/tools/bail-checker/page.tsx` does not render the `note` field, so the user sees nothing for those sections.

## Acceptance criteria

1. An IPC section with no BNS equivalent shows the note text from the API, not an empty result and not a guessed BNS section.
2. Ajay's words are used exactly as they come from the API; the page adds none.
3. Manual check at 375 and 1280 px in the report (`apps/web` has no tests).

## Signed words (Ajay, 12 Oct 2026)

All already signed; the page adds none, and shows them instead of "not found in our BNS database":

- IPC section with a null target: the API `note` as is ("No BNS equivalent. Check the Gazette").
- Explicit "NNN-IPC" with no table row: "Not found in the IPC table. Check the Gazette".
- After T-277: null bailable or cognizable: "Depends. Check the First Schedule."
- A section with no offence row: "This section does not create an offence. Check the Gazette."

## Added 12 Oct 2026 (Shashank, T-277 Explore; Priya's call)

`bail-checker/page.tsx` and `timeline-tracker/page.tsx` show a null as "Non-Bailable" and divide by the bail period. Both are folded into T-278: render the API's "Depends. Check the First Schedule." and "Check BNSS section 187." (Ajay's signed words, no new words, no design change). Build after T-277 merges.
