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
