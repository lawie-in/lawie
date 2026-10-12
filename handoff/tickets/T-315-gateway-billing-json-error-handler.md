# T-315 — Gateway and billing: same JSON-error handler as T-307

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (build). Arjun glance |
| Mode   | Small fix (gateway + billing) |
| Status | To do. Tanvi after T-307. Found by Tanvi in T-307, 12 Oct 2026. The auth part rides T-299 (Kunal) |

T-307 gave drafting a handler that answers malformed, oversized and bad-encoding bodies with plain JSON and echoes nothing. Gateway and billing likely still echo the body, in the response or to stderr. Auth matters most, because login bodies hold passwords; that part is folded into T-299.

## Acceptance criteria

1. Gateway and billing return a plain JSON 4xx for malformed, oversized and bad-encoding bodies, in every environment, and echo nothing in the response or the logs.
2. The same approach as T-307. Tests per service.
3. No change to how valid requests are handled.
