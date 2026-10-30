# T-697: Drafting async routes have no error wrapper

Status: backlog (pre-existing). Raised 30 Oct 2026 by Priya from Shashank's T-684b review.

The drafting service's async Express routes have no error wrapper. A rejected promise can skip the error handler (Express 4 does not catch async errors), leaving the request hanging or crashing the process instead of returning a 500.

## Acceptance criteria

1. Explore: list the async route handlers in apps/drafting that have no try/catch or wrapper.
2. Wrap them (one shared asyncHandler, or the pattern another service already uses) so every rejection reaches the error middleware and returns the normal error response.
3. No change to successful responses; no PII or document content in the error logs.
4. Tests: one rejected handler per router returns 500 and does not hang.
