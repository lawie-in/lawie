# T-266 — Cue matching: match Latin cues at the start of a word, and FIR numbers as a whole token

| Field          | Value |
| -------------- | ----- |
| Phase          | 1 — Describe and draft |
| Owner          | Ajay (signed rule, 12 Oct 2026). Lead (build). Anushka (verdict) |
| Mode           | Small fix after T-200 merges. Legal content (`brief-drafter.ts`, signed cue matching) |
| Status         | To do. Unassigned. Queued for vishal after T-200 (his code). Raised by T-200's reviewer, ruled by Ajay |
| Depends on     | T-200 |

## Acceptance criteria

1. Latin cue entries match at the START of a word, so "ground" no longer matches "background".
2. A FIR number matches as a whole token: no adjacent digit and no "/", so "12" doesn't match a date.
3. No other change. "submitted" stays weak (accepted), and the FIR cue matching its own blank is intended. "bail … before this Hon'ble Court" is closed by dropping "before" in T-241, not here.
4. Tests for each rule. Ajay signs the diff. Moved snapshots are listed for him.
