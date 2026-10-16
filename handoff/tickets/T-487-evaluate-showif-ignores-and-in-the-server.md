# T-487: The server's showIf ignores "&&", so optional s.141 fields sit empty on the brief

| Field  | Value                                                          |
| ------ | -------------------------------------------------------------- |
| Status | To do. V1.1 (found in T-471 review, 16 Oct 2026). Priya        |
| Owner  | Lead who is free; Ajay not needed unless a field label changes |
| Mode   | Small fix (drafting only, no legal text)                       |

## Source

Vishal, T-471 reviewer should-fix: the server's evaluateShowIf (template-engine.service.ts) ignores `&&`, so the 10 optional s.141 fields show as empty on the brief for individual, proprietor and HUF drawers. The notice is unaffected and the fields are never asked of the user; they only clutter the brief.

## What

~5 lines in template-engine.service.ts so `&&` conditions are evaluated. Check other packs for showIf conditions with `&&` that behave wrongly for the same reason. Test both ways.
