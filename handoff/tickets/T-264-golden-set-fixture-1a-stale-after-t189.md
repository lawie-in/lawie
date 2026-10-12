# T-264 — Golden-set fixture 1a is stale since T-189

| Field          | Value |
| -------------- | ----- |
| Phase          | 0 — Prep |
| Owner          | Lead (build). Ajay (sees the changed draft text) |
| Mode           | Small fix. Fixture data under `scripts/golden-set/fixtures`, not a legal path |
| Status         | Merged into develop_staging (addd9e7), 12 Oct 2026. Nothing to test in the UI |

## Problem

`golden:set --dry-run --only 1a` fails: `[verifier] sections_charged 'section 318(4) BNS' expected kept, actual 'verifier dropped, a required fact left out: not in the draft (paragraph 1)'`.

Since T-189, `sections_charged` is a required ledger fact, and the verifier correctly flags the fixture's recorded "clean" Drafter reply, which never mentions 318(4). The product is right and the fixture is stale. The harness test isn't part of the drafting jest run, so T-189's tests didn't catch it.

The nightly golden-set job (20:30 UTC, `develop_staging`) runs the dry run, so it has been red since T-189 merged.

## Acceptance criteria

1. Update fixture 1a's recorded clean Drafter reply so the draft cites "section 318(4) BNS" and the grounds. Ajay sees the changed draft text.
2. Check the other golden fixtures for list fields that T-189 made required (grep for `sections_charged` and `grounds`), and fix any that fail the same way.
3. `golden:set --dry-run` passes for every fixture.
4. Add the dry run to the drafting CI test step, so this can't go quiet again. If it needs secrets, then only its dry-run mode.
