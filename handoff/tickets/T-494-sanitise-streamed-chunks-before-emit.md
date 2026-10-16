# T-494: Sanitise streamed chunks before emit

| Field  | Value |
| ------ | ----- |
| Status | To do. V1.1, low priority (Arjun, 16 Oct 2026). Priya |
| Owner  | Lead who is free |
| Mode   | Small fix |

## Source

Kunal, T-477 (16 Oct 2026). Arjun: leave it for now.

## What

T-477 strips an echoed "[only when: ...]" marker in sanitiseAIBody, on the finished draft. The raw streamed chunks (SSE) can still carry an echoed marker before the strip. Neither web client shows the raw chunks, and no third-party client exists, so this is low. It matters the day we open an API.

## Acceptance criteria

- Streamed chunks are sanitised before they are emitted, or the stream carries only the cleaned text.
- Tests with the marker split across two chunks.
