# T-491: Drafter writes "in custody since" with no custody date

| Field  | Value                                                   |
| ------ | ------------------------------------------------------- |
| Status | To do. V1.1 (Priya, 16 Oct 2026)                        |
| Owner  | Lead who is free                                        |
| Mode   | Small fix or full chain; the lead decides after Explore |

## Source

Vishal, T-480 golden run 72 (fixture 27, 16 Oct 2026): the only fail was the drafter writing "in custody since" with no custody date. Same as fixture 1a.

## What

When the custody date is not in the facts, the draft must print the signed blank (a "[To be confirmed: ...]" form) instead of "in custody since" with nothing after it. If the date is given, it prints it.

## Acceptance criteria

- No sentence in a bail draft ends at "in custody since" without a date or a blank.
- Fixtures 1a and 27 pass; no other golden moves; Ajay sees the diff if prompt text changes.
