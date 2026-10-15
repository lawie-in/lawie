# T-420: blanks check before downloading the annexures pack

| Field  | Value                                                                                    |
| ------ | ---------------------------------------------------------------------------------------- |
| Status | Todo. Unassigned. After T-381. Deferred from T-381 by Ajay (b2c0d10), 13 Oct 2026. Priya |
| Owner  | Lead (drafting + web), Ajay (signs)                                                      |
| Mode   | Full chain                                                                               |

## Why

Ajay ruled that the T-194 blanks check applies to the annexures pack. v1 ships without it, on his conditions: the route refuses missing party names, and underscores appear only for hand-filled items. The pack is a server-rendered PDF, so the browser can't read its blanks.

## Acceptance criteria

1. A server preflight (POST /documents/:id/annexures-pack/check) returns the list of blanks the pack would print.
2. The card shows the T-194 blanks dialog before download when the list isn't empty.
3. The pack PDF carries the draft header and highlights, in line with the other exports.
4. Ajay signs the strings and the golden diff.
