# T-334 — More "none filed" phrasings for earlier bail applications

| Field  | Value |
| ------ | ----- |
| Phase  | 1 — Describe and draft |
| Owner  | Ajay (signs the phrasings, as an _averments addendum). Lead (build) |
| Mode   | Small fix (legal content) |
| Status | To do. Waits on Ajay's signed phrasings. Mahak after T-190 (same file). Not v1-blocking (Ajay). Found by Mahak in T-190, 12 Oct 2026 |

The `first_bail_application` equals list in `_averments/bail_regular.json` misses common "none filed" phrasings, for example "koi bail nahi". Such an answer stays a fact, and the draft prints "the earlier bail applications are: koi bail nahi".

## Acceptance criteria

1. Ajay's signed Hindi and English "none filed" phrasings are added to the equals list, word for word.
2. Tests: each signed phrasing counts as "none filed", and a real earlier application still prints.
3. Ajay sees the diff.
