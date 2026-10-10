# T-147e — A golden set that runs against the real model, so T-147 cannot come back

| Field          | Value                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------- |
| Phase          | 1 — Describe and draft                                                                                              |
| Owner          | Vishal (harness), Anushka (fixtures, jointly)                                                                       |
| Mode           | Build, full chain. Merge to develop                                                                                 |
| Status         | Blocked on T-147d                                                                                                   |
| Size           | S (half a day for the harness; fixtures run alongside)                                                              |
| Depends on     | T-147d (the verifier is the assertion)                                                                              |
| Branch         | feat/t-147e-golden-set                                                                                              |
| Legal sign-off | Not needed for the harness. Any fixture whose expected output asserts legal wording: Ajay confirms that expectation |
| Created        | 2026-10-09                                                                                                          |
| Source         | ADR-022 section 2D. Parent: T-147                                                                                   |

## Problem

T-136 passed its tests and still produced the T-147 failures, because the tests ran against a stubbed model. A stub shows what the code does with a canned answer, not whether the model invents facts. Nothing currently stops T-147 regressing the week after it closes.

## User

Us. This is the gate that keeps the fix in place while the drafting prompts keep changing.

## Solution

A fixture harness that runs real matters through the real pipeline against the real model, with the four verifier checks as the assertions.

- **Anushka's T-147 bail matter is fixture 1**, with all three defect classes as explicit expectations.
- Target **~15 Hinglish-heavy fixtures** across the 5 seeded packs, written with Anushka.
- Pre-merge gate on changes to the Drafter prompt, a rule pack or the normalizer. Nightly otherwise.
- The normalizer keeps its own fast unit tests (no model, every commit) from T-147a.

**Fixture isolation is release-blocking.** There is no separate dev database — fixture runs write to production. Every fixture document carries `runType: "fixture"` at the matter, ledger, draft and usage-record level, and every user-facing query, every analytics aggregation and every usage or billing counter filters it out.

## Acceptance criteria

1. One command runs the whole set against the real model and reports per-fixture pass or fail with the specific violations.
2. Fixture 1 is Anushka's T-147 matter and asserts, explicitly: the four invented averments are absent; the Rs 3 lakh and the police station are present; the memo date, the bank branch and the rent terms are character-exact.
3. At least 15 fixtures, Hinglish-heavy, spread across the 5 seeded packs. Each names the real failure or risk it covers.
4. **Fixture isolation, verified not assumed.** After a full run: no fixture matter appears in any user-facing list, no fixture draft counts against any Ink or drops balance, and no fixture row lands in analytics. The test demonstrates each of the three. This criterion is release-blocking — ADR-022 says so.
5. The suite is wired as a pre-merge gate for changes under the Drafter prompt, `config/document-rules/` and the normalizer, and runs nightly otherwise.
6. Each fixture's `runId` is recorded with its result, so a failure can be traced to the generation that produced it.
7. Confidence floors per fact type are calibrated against the set and the chosen values recorded (ADR-022 open question 5).
8. A failing fixture fails the run with a readable diff, not a stack trace.
9. CI green on all four services.

## Out of scope

- Fixing what the set exposes. Each new failure becomes its own ticket.
- The 24 bail descriptions and the ~126 remaining in T-113. That is the intake gate, a different set with a different purpose; do not merge the two. If a T-113 description makes a good fixture, copy it and say so.
- Advocate testing with real users: T-402.
- Load or cost benchmarking. Record tokens per fixture run if it is free to do so; analysis belongs with T-004.

## What Ajay must sign

Nothing for the harness. If a fixture's expected output asserts particular legal wording — a prayer line, a verification line — he confirms that expectation so we are not freezing a mistake into the suite.

## Files (expected)

New: `scripts/golden-set/` (runner, fixtures, README), `apps/drafting/src/__tests__/t147e-fixture-isolation.test.ts`. Touched: the matter, ledger, draft and usage models for `runType`; every user-facing query, analytics aggregation and usage counter that must filter `"fixture"`; CI workflow under `.github/workflows/`. Read-only: `scripts/intake-gate/bail-set.json`, ADR-022.
