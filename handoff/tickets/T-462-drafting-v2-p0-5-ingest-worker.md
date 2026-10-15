# T-462: Drafting v2 phase 0 (P0-5): Ingest worker

| Field  | Value |
| ------ | ----- |
| Status | Blocked: after T-403. Nobody starts before v1 is on main. Priya, 15 Oct 2026 |
| Owner  | Lead to be assigned after T-403; Arjun (architecture and acceptance criteria) |
| Mode   | Full chain |

## Source

ADR-026 "Drafting v2: the Law Library and the Document Compiler", approved by the founder 15 Oct 2026 (D1 to D10). Phase 0 ticket P0-5, section 11 of handoff/design/drafting-v2/00-adr-026-drafting-v2.md.

## Scope

BullMQ job: extract, split, byte-exact passages with hash; worker entrypoint in the drafting image; CI job.

Services: drafting; CI.

## Gate

none (touches CI and the drafting image: root-config rules apply)

## Acceptance criteria

See the Arjun section below.

## Branch (founder, 15 Oct 2026)

v2 work lives on `develop_staging_v2`, cut from `develop_staging` at bafe88d3. Cut this ticket's branch from `develop_staging_v2` and merge back into `develop_staging_v2`. Never into `develop_staging` or `develop`. Only the founder merges `develop_staging_v2` anywhere.

## Architecture reference

handoff/design/drafting-v2/ (ADR-026, HLD, system design, DB design, LLD).

## Arjun (15 Oct 2026) — acceptance criteria

1. A BullMQ worker `library-ingest` in `apps/drafting/src/worker/` with its own entrypoint (`yarn workspace @lawie/drafting worker`), same Docker image, env-selected; `REDIS_URL` required for the worker only — the API keeps working without it (enqueue returns 503 `ingest_unavailable`, upload still succeeds).
2. Job: fetch original from S3 → extract text (PDF via `pdf-parse` or the library already in the repo; `txt`/`html` direct; no OCR — scanned PDFs fail the job with `needs_ocr`) → split by class: statutes at section boundaries into `provisions`, judgments at paragraph numbers into `passages` per para, everything else into paragraph passages → write passages byte-exact with hash → set source status `review`.
3. Splitting is deterministic and tested on committed fixtures (a 3-section Bare Act excerpt, a 5-paragraph judgment excerpt, both written for the test, not real licensed text): same input → identical passage set and hashes.
4. Re-running a job for the same `(sourceId, version)` is idempotent: upsert on the unique passage key; no duplicates.
5. Concurrency 2, attempts 3 with backoff, failed jobs keep the error on the `source_version` (`ingestError`) and leave status `uploaded`.
6. CI: a `drafting-worker` job builds the worker entrypoint and runs its tests; root config (`.github/workflows`, Dockerfile) changes follow the root-config claim rule in `multi-lead.md`.
7. Logs carry source id, version, counts and durations only.
8. Out of scope: embeddings (phase 2), edges and mappings inference (phase 1), status review (T-463).
