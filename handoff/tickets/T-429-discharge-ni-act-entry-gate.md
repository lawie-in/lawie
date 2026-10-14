# T-429: discharge application sends the NI Act entry only for a s.138 charge

| Field  | Value                                                             |
| ------ | ----------------------------------------------------------------- |
| Status | Todo. Vishal, after T-407. Priya, 14 Oct 2026                     |
| Owner  | Vishal (build), Ajay (ruling 0864b04, T-363 file)                 |
| Mode   | Small fix (legal content: pack related_acts / prompt input)       |

## Acceptance criteria (Ajay, 0864b04)

1. discharge_application's NI Act entry (s.138, s.141) reaches the model only when the charged sections include NI Act s.138.
2. Test: a discharge application on a BNS-only charge gets no NI Act entry; one on a s.138 charge still gets it.
3. Ajay signs the diff.

4. Also (Ajay T-430, 03b3e6e): fix the s.438 and s.442 descriptions and add s.440, exactly as signed.
