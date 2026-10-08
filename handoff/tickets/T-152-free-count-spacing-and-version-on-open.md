# T-152 — Two small faults from run 1: "5free" and the version that rises on open

| Field          | Value                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------- |
| Phase          | 4 — Polish (split from T-142; the rest of T-142 stays parked)                             |
| Owner          | Vishal (build), Anushka (tests on develop before GTM)                                     |
| Mode           | Fix, full chain                                                                           |
| Status         | Ready for Vishal                                                                          |
| Size           | S                                                                                         |
| Depends on     | None                                                                                      |
| Branch         | fix/t-152-free-count-spacing-and-version-on-open                                          |
| Legal sign-off | Not needed. Must not touch any legal-content path (`.claude/docs/legal-content-paths.md`). If the cause is in one, stop: BLOCKED |
| Design         | Not needed                                                                                |
| Created        | 2026-10-07                                                                                |
| Source         | Anushka's run 1, 6 Oct 2026, Minor findings (`handoff/quality/2026-10-06-baseline-run-FAIL.md`) |

## What Anushka found

1. On screen: "You have 5free documents this month." (no space). `apps/web/src/app/dashboard/page.tsx:204` has a similar line with the space; find the one she saw (likely a JSX line break eating the space, or another component).
2. The version number rises each time a saved draft is opened without editing (v2 to v5).

## Acceptance criteria (Priya, 7 Oct 2026)

1. Every place in `apps/web` that shows the free-document count reads "You have N free documents this month" with one space either side of N, for N = 0, 1, 3, 5. For N = 1 it says "document", not "documents". No other wording changes (T-141 owns copy).
2. Opening a saved document and leaving it without typing creates no new version: the version number shown is the same before and after, across three opens. Trace the cause first (autosave on mount, editor normalising the HTML, or the drafting `PATCH` saving unchanged text) and name it in the report.
3. Editing one character and waiting for autosave still creates exactly one new version.
4. A test in the service that saves versions (if the cause is server-side) fails when unchanged text creates a version. If the cause is web-only, a stubbed browser check shows no `PATCH` (or a `PATCH` that the server ignores) on open.
5. No change to drafted text, templates or rules.

## Out of scope

- Every other T-142 line (advocate details, unconfirmed brief warning, Section finder, My documents search, Templates "Other", catalogue text, notice wording, Jharkhand state line). Catalogue text lives in `lease_deed.json` and `fir_quashing.json` (legal content; `fir_quashing` may also be touched by T-148): later, with Ajay.
