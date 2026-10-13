# T-421: ask which side the client is on when the annexures are refused

| Field  | Value                                                                                                     |
| ------ | --------------------------------------------------------------------------------------------------------- |
| Status | Todo. Unassigned (web + drafting). After T-381. From Ajay, T-381 Addendum 4 (6600f35), 13 Oct 2026. Priya |
| Owner  | Lead (web + drafting), Rajesh (small design), Ajay (signs the question)                                   |
| Mode   | Full chain                                                                                                |

## Why

T-381 refuses to make the annexures pack when the client's side is unknown. The user should be able to answer that, not just hit a dead end.

## Acceptance criteria

1. When the pack is refused because the client's side is unknown, the card asks the client_role question in Ajay's signed wording.
2. The answer is saved on the draft. The pack then generates without the user re-drafting.
3. Tests cover the refused path, the answer, and the successful pack.
