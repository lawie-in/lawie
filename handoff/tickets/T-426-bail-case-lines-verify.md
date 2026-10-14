# T-426: verify per-court bail case lines

| Field  | Value                                    |
| ------ | ---------------------------------------- |
| Status | Done 2fcf6c4: lower-court lines signed, built in T-428 (Shashank). HC/SC lines moved to T-427. Priya, 14 Oct 2026 |
| Owner  | Ajay (verification; 477fcaa)             |
| Mode   | Verification; any code change gets its own ticket |

## Acceptance criteria

1. Ajay verifies the bail case line each court type prints: district criminal list lines; CJM/JMFC "Criminal Case No."; Sessions "Criminal Miscellaneous Case No." vs "Bail Application No.".
2. He signs the list or names the lines to change; Priya turns any change into a ticket (feeds T-404 part 2's bail case line from the court record).
