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

## Arjun (29 Oct 2026) — defaults and Redis-down rule

- Scope: every aux (non-body) Anthropic call in drafting — intake reception/match/extract, preflight, v3 Extractor, fact-checker, language — through one `withAuxLimit(kind, userId, runId, fn)` helper. Body (Drafter) streaming calls are not aux; unchanged.
- Limits (AppSettings, with these defaults): `ai.limits.aux_concurrency_per_process` = 8 in-flight; `ai.limits.aux_per_user_per_min` = 30; `ai.limits.aux_per_run` = 12 (T-683's 6-per-run Extractor cap stays inside it). Anthropic 429/529: exponential backoff 1 s → 2 s, max 2 retries, then degrade (the call's own fallback: v2 path for the Extractor, "unavailable" outcome for intake as today).
- Redis down: **fail-open, degraded** — the limiter logs `aux_limiter_degraded` once per minute and lets calls through with the per-process concurrency cap only (in memory). Aux calls are not billed to the user, so an outage must not block intake; the body stage keeps its own Ink/cost-cap guards, which fail closed.
- Over-limit response: 429 JSON `{ error: 'busy', retry_after_ms }` on intake routes; never a 503 (the T-616 refresh limiter's fail-closed rule is for auth, not here).
- Tests: concurrency cap holds under 20 parallel calls; per-user counter resets; Redis-down path logs once and passes; 429 backoff then degrade; body calls untouched.

- The per-run limit reads the run from apps/drafting/src/services/run-context.ts (T-681a, Arjun 30 Oct). Never add a second AsyncLocalStorage.
