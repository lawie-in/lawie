# T-279 — Lower-case blank markers in the legal drafting files

| Field          | Value |
| -------------- | ----- |
| Phase          | 1 — Describe and draft |
| Owner          | Ajay (decides and signs). Lead (builds) |
| Mode           | Small fix (drafting). Legal path: `fact-verifier.ts` and `brief-drafter.ts` |
| Status         | Ajay decided 12 Oct 2026: all three places case-insensitive. To do: mahak, after T-238 |
| Depends on     | T-273 merged |

T-273 makes the blank marker case-insensitive in the export and server PDF. Three places in legal files still match upper case only:

- `fact-verifier.ts` ~L209: keeps entities out of blank ranges. A lower-case marker's label could be read as a claim.
- `fact-verifier.ts` ~L1511: telemetry only.
- `brief-drafter.ts` ~L1349 `BLANK_LINE`: a whole line `[to be confirmed: x]` in lower case is not stripped before saving.

Our code and prompts always write upper case. Lower case only comes from the model ignoring the prompt, or a user typing it.

## Acceptance criteria

1. Ajay decides, for each of the three places, whether it matches case-insensitively.
2. Any change is listed for Ajay before merge, with a test per place changed.
3. If he decides to leave them, the ticket records why and closes.

Note (Mahak, T-273): `apps/drafting/src/config/document-rules/_averments/README.md` line 19 mentions `{{MISSING: label}}`. Revisit it if Ajay changes the marker.

## Ajay's decision (12 Oct 2026)

All three places become case-insensitive: the `i` flag on the marker words only; the fixed text after them stays as written.

1. `fact-verifier.ts` BLANK_RE (~L209): a lower-case marker is a blank, never an entity or a claim.
2. `countMissingPlaceholders` (~L1511): same, for consistency.
3. `brief-drafter.ts` BLANK_LINE (~L1407): yes, and this matters most. Today a whole-line "[to be confirmed: x]" in lower case can be taken for a note line and deleted before saving, which silently drops a blank the advocate must fill. It must be kept.

Tests: one per place (lower case and Title case), plus "a lower-case blank line survives the note stripper". The `_averments/README.md` line 19: leave it (the marker we write stays upper case). Ajay sees the diff before merge.

## Mahak's Explore findings (12 Oct 2026) — questions for Ajay after the usage reset

1. Fact correction: a whole-line lower-case "[to be confirmed: x]" is NOT deleted today. `brief-drafter` `checkOneDocument` has no stripper; `BLANK_LINE` only decides whether such a line gets a false C4 warning ("The draft has a part that may not belong … Check that the draft is one document."). The blank stays in the text; the harm today is the false warning, which may lead the advocate to delete the blank. The fix stops the warning. Test: "no C4 warning, line kept".
2. Scoping per "i on the marker words only": `BLANK_RE` in `fact-verifier` is split into a case-insensitive marker part (`{{MISSING}}`, `[To be confirmed:`) and an unchanged fixed part (`[Section — verify before filing]`, `[Authority — add if relied upon]`, `___`). In `BLANK_LINE` only "to be confirmed:" becomes case-insensitive. `countMissingPlaceholders` gets `i`. The shared and web finders already match all four markers in any case since T-233. Ajay: loosen the fixed-text ones too, or not?
3. One more upper-case-only spot, outside the three: `fact-verifier.ts` ~L1051 `present()` checks `/\{\{\s*MISSING/` on a ledger display, so a "{{missing: …}}" display would not count as present. Include it, or leave it?

## Priya's call on the format hunks (12 Oct 2026, to be sent to Mahak after the usage reset)

The commit hook's prettier run made `fact-verifier.ts` a 180-line diff, mostly format-only; the real change is about 10 lines. Keep the commit as is (no .prettierignore, no claim extension) and list the format-only hunks separately for Ajay, as with T-189 and T-194 (he accepted that before). He judges the substance at sign-off. Branch `fix/t-279-blank-marker-case-legal-files`, WIP head 658dac4.

## Ajay's answers (12 Oct 2026, relayed by Priya; Ajay's own messages to Priya)

- **Q1 (C4 framing):** accepted. A whole-line lower-case "[to be confirmed: x]" is not deleted today; it drew a false C4 warning. The test is "no C4 warning, line kept".
- **Q2 (scoping):** OK. The `i` flag goes on the marker words only; fixed text like "[Section — verify before filing]" stays as written.
- **Q3 (`present()`):** YES. `fact-verifier.ts` `present()` (~L1153 now; earlier ~L1051) also accepts the lower-case "{{missing:" form: a lower-case marker is still a blank. This is the fourth place; it is covered by this sign-off.

Ajay still sees the diff (the 5 semantic hunks listed apart from the prettier wrapping) before merge.
