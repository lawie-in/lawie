# T-692: Shared rate limiter for Anthropic aux calls

Status: backlog. Scheduled with T-685 (resumable run state). Raised 29 Oct 2026 by Arjun.
Priority: P1 for v3. Under ADR-drafting-v3 point 6 (guards per step: timeout, per-run token and cost cap, rate limit), no new Anthropic call ships without rate-limit and cost guards.

## Acceptance criteria
1. One shared limiter (Redis-backed, ioredis) used by every aux model call. This covers callAuxModel and the v3 roles: extractor, matcher, fact checker and language. No per-call ad-hoc limits.
2. Limits per user and per org/workspace (per-minute and per-run), plus a global ceiling. Values live in app settings, and Arjun sets the defaults.
3. A call over the limit fails safe. The run stops with a retryable message, takes no Ink, and is logged with stage, model and reason (no content).
4. If Redis is unavailable, the limiter fails safe as Arjun specifies (closed or degraded); it never runs unbounded.
5. Unit tests and one route test. They join the sanity tier if they gate Ink.

## Depends on
T-684 (per-role settings), T-683 (Extractor call site), T-685 (run state).
Files are granted after Explore.
