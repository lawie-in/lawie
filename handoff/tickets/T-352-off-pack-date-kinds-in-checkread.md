# T-352 — Date reader counts other date kinds before assigning a quote

| Field  | Value |
| ------ | ----- |
| Phase  | 1 — Describe and draft |
| Owner  | Ajay (asked). Lead (drafting) |
| Mode   | Small fix (legal content) |
| Status | To do. Not a release gate (Ajay). After T-342. Raised by Vishal, 12 Oct 2026 |

On the model path, a `notice_sent` quote such as "notice sent to him was served on 5 April" is kept as the notice-sent date (L5), so the served date can print on the notice's date line. It is not a false pass of the s.138 checks.

## Acceptance criteria

1. `checkRead` (intake date reading) also weighs date kinds outside the current pack that have their own cue words, so a quote that names another kind ("served on") is not assigned to this one.
2. Works for every pack, not only legal_notice_s138.
3. Tests: the "served on" quote is not kept as L5; a plain "notice sent on" still is. Ajay sees the diff; any golden that moves goes to him.
