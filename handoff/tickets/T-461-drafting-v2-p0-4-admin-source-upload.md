# T-461: Drafting v2 phase 0 (P0-4): Admin: source upload and status flow

| Field  | Value |
| ------ | ----- |
| Status | Blocked: after T-403. Nobody starts before v1 is on main. Priya, 15 Oct 2026 |
| Owner  | Lead to be assigned after T-403; Arjun (architecture and acceptance criteria) |
| Mode   | Full chain |

## Source

ADR-026 "Drafting v2: the Law Library and the Document Compiler", approved by the founder 15 Oct 2026 (D1 to D10). Phase 0 ticket P0-4, section 11 of handoff/design/drafting-v2/00-adr-026-drafting-v2.md.

## Scope

Source upload, class, licence, displayPolicy; S3 original; status flow uploaded, review, live, with versions.

Services: web admin; drafting.

## Gate

Rajesh design for the admin screens

## Acceptance criteria

See the Arjun section below.

## Architecture reference

handoff/design/drafting-v2/ (ADR-026, HLD, system design, DB design, LLD).

## Arjun (15 Oct 2026) — acceptance criteria

1. Admin routes in `apps/drafting` (admin auth): `POST /admin/library/sources` (multipart: file ≤ 50 MB, `class`, `title`, `licence`, `displayPolicy`, `effectiveFrom`), `GET /admin/library/sources`, `GET /admin/library/sources/:id`, `PATCH /admin/library/sources/:id` (metadata only), `POST /admin/library/sources/:id/approve`, `POST /admin/library/sources/:id/retire`.
2. Upload stores the original in S3 under `library/<sourceId>/v<n>/<original name>`, creates the `source` (status `uploaded`) and `source_version` n+1, and enqueues `ingest(sourceId, version)` on BullMQ. S3 client config via env (`LIBRARY_S3_BUCKET`, region, credentials from the environment, never in the ticket). Tests use an in-memory S3 stub.
3. Status flow is enforced server-side: `uploaded → review` is set by the worker (T-462), `review → live` only by `approve`, `live → retired` only by `retire`. Any other transition → 409 with a flat `{error, from, to}` body.
4. `approve` sets `source_versions.approvedBy` and `effectiveFrom`; the previous live version gets `effectiveTo` = the new `effectiveFrom − 1 day` and stays queryable for as-of lookups. Never deletes.
5. Web admin pages per Rajesh's design: sources list (status, class, version, licence), upload form, source detail with version history and the approve/retire actions. Admin-only route guard like the existing admin pages.
6. No PII in logs: log source ids, sizes and statuses only, never file names or content.
7. Tests: route auth; transition matrix; S3 key layout; approve sets dates on both versions; web form validation.
8. Out of scope: extraction (T-462), review of passages (T-463).
