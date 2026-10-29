# T-686 — Raw court id must never reach a draft (fail closed)

Status: building (mahak, fix/t-686-court-fail-closed), 29 Oct 2026
Priority: P1, v1.2.6 headline (T-674B1 rides along)
Owner: mahak. Raised by Arjun.

## Problem
When a court id picked in the form (e.g. `bihar_civil_junior_patna`) does not resolve to a court row (inactive, not found, or the 5 s lookup times out), the draft prints the raw id: "IN THE COURT OF bihar_civil_junior_patna". The lookup failure only warns.

## Acceptance criteria
1. An id-shaped court value (`/^[a-z0-9]+(_[a-z0-9]+)+$/`) that does not resolve after one retry stops the run **before** the Ink hold and before any model call. Zero Ink is taken.
2. The response is JSON, HTTP 503: `{error:'court_unavailable', code, reason:'Court unavailable, try again', retryable:true, runId}`. The web shows "Court unavailable, try again" in the existing failure display, with no new component.
3. The log line carries `courtId`, reason (`inactive|not_found|timeout`), kind and runId. No draft content. The generation is recorded as failed with zero usage.
4. Typed free-text court names and an empty court behave exactly as today.
5. The resolved court data is passed into generation, so the court is looked up once.
6. The annexures route (`documents.routes.ts` ~2556-2575) fails closed the same way.
7. Tests: a new t686 suite covering inactive, not_found, timeout-then-retry-ok, timeout-twice, typed name, and empty. Existing route tests that use id-shaped courts seed a Court row.

## Grants
- `apps/drafting/src/routes/documents.routes.ts`: the court check ~1049-1066 and the annexures ~2556-2575 only. Not Vishal's T-678 catches or recordGeneration hunks.
- `apps/drafting/src/services/ai.service.ts`: the input and lookup-skip hunk ~1170-1237 only. This is a **legal-content file**, so Ajay signs the hunk.
- NEW `apps/drafting/src/services/court-resolve.service.ts`.
- `apps/web/src/app/dashboard/new/page.tsx` (non-OK JSON branch ~410-420) and `apps/web/.../intake/generationFailure.ts`.
- NEW t686 tests, plus Court-row seeding in the affected route tests (t300-template-route, t637-form-gate.routes, documents.generate.resilience and others).

## Decisions (Priya, 29 Oct 2026)
- HTTP 503 with retryable:true.
- The refusal line is not draft wording, so Ajay does not sign the copy. He does sign the ai.service.ts hunk, because the whole file is listed in legal-content-paths.md.
- Annexures are in scope.
- The web change reuses the existing failure display, so no Rajesh spec is needed. If a new component or layout is needed, stop and ask.

Mode: small fix (developer + tester), plus Ajay's byte check on the ai.service.ts hunk.
