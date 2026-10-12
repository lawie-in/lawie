# T-279 — Lower-case blank markers in the legal drafting files

| Field          | Value |
| -------------- | ----- |
| Phase          | 1 — Describe and draft |
| Owner          | Ajay (decides and signs). Lead (builds) |
| Mode           | Small fix (drafting). Legal path: `fact-verifier.ts` and `brief-drafter.ts` |
| Status         | To do. Unassigned. Raised by Mahak (T-273), 12 Oct 2026 |
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
