# T-285 — A long repair pass can drop the draft stream

| Field          | Value |
| -------------- | ----- |
| Phase          | 4 — Polish and release |
| Owner          | Arjun scopes. Founder (production nginx). Lead (build) |
| Mode           | Small fix |
| Status         | To do. Unassigned. Found by Mahak (T-226), 12 Oct 2026 |

Production nginx has `proxy_read_timeout` of 60 s. The repair pass sends nothing on the stream, so a long repair can exceed 60 s and the connection drops, even though the draft may complete. Pre-existing. Fix options for Arjun: send a keep-alive from the repair pass, and/or raise the timeout on the production host (founder task).

## Acceptance criteria

1. A repair pass of more than 60 s does not drop the stream.
2. The T-226 hold TTL (30 min) is not shortened by this.
