# T-106 — The Drafter writes under the document's rules

| Field      | Value                                                                                                                                                           |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase      | 1 — Describe and draft                                                                                                                                          |
| Owner      | Vishal                                                                                                                                                          |
| Mode       | Full chain                                                                                                                                                      |
| Status     | Done. Part 1 (PR #41) and part 2 (PR #44) merged by the founder on 6 Oct 2026. `develop` is green. Not switched on. The label in the DOCX footer moves to T-125 |
| Depends on | T-105, T-124, T-127                                                                                                                                             |
| Branch     | feature/t-106-drafter (PR #41), feature/t-106-drafter-no-pack (PR #44)                                                                                          |
| Created    | 2026-10-04, rewritten 2026-10-05                                                                                                                                |

## Goal

A confirmed brief becomes a draft that contains what the law requires for that kind of document, and nothing the user did not give.

## Context

- ADR-021, approved by the founder on 5 Oct 2026. This ticket was "Drafter and delivery for requests with no template". It is now the drafting step for all requests.
- The three-layer pipeline in `ai.service.ts` (assemble, post-process, validate) is reused. Its input changes from form values to the confirmed brief and the rule pack.
- Models are final: Sonnet for the Drafter, set in `ai.drafting_model`.
- There is no Reviewer step. Review by agent is T-111 and revision is T-205, both paid options.

## Acceptance criteria

**Drafting**

- The Drafter's input is the confirmed brief, the pack's mandatory clauses and drafting instructions, the relevant acts and the court rule.
- The body is written in one Drafter call (decision D6). The cause title, prayer frame, verification and advocate block are added by code from the brief.
- The draft has no fact, name, date, amount or section number that is not in the brief. Anything unknown is a visible blank with the placeholder from T-107, section 4.

**Checks**

- The existing checks run on every draft: old-law references, section numbers, the court's format when the court is known.
- For a draft with a pack, every mandatory clause is checked against the pack.
- If a clause is missing, one automatic repair pass runs (decision D3). The user is not charged for it. Its tokens and cost are recorded under the same `runId`.
- What is still missing after the repair pass is returned as a finding and shown to the user.

**Label (decision D5, with Ajay's condition)**

- A draft with no pack is saved with the type `guided` and always carries "Starting draft — review before use · not court-verified" on screen and in the PDF and DOCX footer. The user cannot remove it.
- A draft with a pack carries no starting-draft label only when every mandatory clause is present and every check passes. Otherwise it carries the label.
- The standard disclaimer stays on every draft.

**Records**

- The document is saved with its pack id as the type, or `guided`. The confirmed brief is saved with it, because a revision needs it.
- One `Generation` row per attempt, with `runType: initial`, real tokens and cost, and the `intakeId`. A retry keeps the `runId`.
- Estimate before drafting, never charged more than it, a failed run charges nothing (T-003 rules).
- A demand signal is saved for every draft with no pack, with a generic label and no user text.

**Tests and gate**

- Tests cover: a draft with a pack that passes, one with a clause missing before and after the repair pass, a draft with no pack, a blank for an unknown, and a failed run.
- The gate in T-113 passes before this is switched on.

## In scope

- `apps/drafting/src/services/ai.service.ts` and the prompt assembly (legal content)
- `apps/drafting/src/routes/documents.routes.ts`
- `packages/shared` (the `guided` document type)

## Out of scope

- The web screens (T-125)
- Review by agent (T-111) and revision (T-205)
- Encrypting the saved brief (T-115). It is a condition for real users

## References

- ADR: `docs/adr/ADR-021-one-drafting-flow.md`, sections 3.5, 3.6, 3.9 and 5
- Legal sign-off: Ajay, through T-127. Use his prompt text exactly as written. Any change to prompt text needs a new read

## Delivery report — part 1 (Vishal, from the war-room chat, 6 Oct 2026, 13:1x)

Pull request: https://github.com/lawie-in/lawie/pull/41 into `develop`. 4 commits. CI "Test — Drafting" passed on the last one.

### What is built

- `POST /documents/generate-from-brief`, closed unless `feature.describe_first` is on for the user.
- The server works the brief out again from what was sent. A court document with no court or no party named is refused. The court must be in the courts data.
- One Drafter call writes the body under the pack's mandatory clauses. Code adds the cause title, prayer, verification and advocate block.
- A missing mandatory clause starts one repair pass. It is kept only if it leaves every paragraph in place and fewer clauses missing. A failed repair does not fail the draft. It is not charged, and its tokens are recorded under the same `runId`.
- Checks: unfilled blanks in the fixed parts, old-law references, section numbers, facts against the grounds chosen, changed facts, the party names, and any date or section that is in neither the brief nor the pack.
- The label "Starting draft — review before use · not court-verified" goes on when a clause is missing or any check reports a finding. It is saved on the document, returned by `GET /documents/:id` and printed in the PDF footer.
- An unknown is a visible blank, in the fixed parts and in what the Drafter is told.
- The document is saved with the pack id. The confirmed brief is saved with it, encrypted. The unencrypted `formInputs` holds only the kind and `source: brief`.
- One `Generation` row per attempt. A failed run saves no document and charges nothing. A retry keeps the `runId`. Charged once after a successful draft.
- Ajay's Drafter and repair prompts (T-127, sections 4 and 4.1) are copied into `drafter.prompts.ts` by script, not by hand.

### Acceptance criteria not met in this pull request

- **A draft with no pack** (type `guided`, always labelled) is not built. It needs `guided` in `packages/shared`. A change there makes CI run the Billing and Auth jobs, which fail on `develop` (T-130). Part 2 comes after T-130.
- **The demand signal** for a draft with no pack: not built, same reason.
- **The label in the DOCX footer**: not built. That export is made in the browser, so it goes with T-125.
- **"Estimate before drafting, never charged more than it"**: the route uses the same fixed cost per document as `generate-from-template` (`enforceCredits`). No new estimate step was added.
- **A test for a draft with no pack**: none, because that path is not built.
- **The gate in T-113**: not run. The route stays closed.

### Differences from the ticket

- The paragraph target is a field in the request (default 15, kept between 5 and 40). The plan limits of T-206 are not wired in.
- The saved brief is encrypted now. The ticket left that to T-115.
- The label goes on for any finding, not only a missing clause or a failed legal check. That is the careful reading of "every check passes". It may label more drafts than we want. For Ajay and Priya to decide.
- Whether a clause is present is taken from the Drafter's own report at the end of its answer, except clauses with fixed wording, which code looks for in the text.
- `apps/drafting/jest.config.js` now also uses Jest's `github-actions` reporter, so a failed test in CI shows as a note on the pull request.

### Findings

- `bail_regular`: when "currently in custody" is "no", the old template changes the heading to anticipatory bail. Not changed here. For Ajay.
- The courts list in the production database is empty until `yarn workspace @lawie/drafting seed:all` is run. Until then every court document is refused with `court_not_found`.
- The verification that `bail_regular` renders does not name the paragraph numbers. Existing behaviour, not changed. For Ajay under T-129.

### What was run

- CI "Test — Drafting": passed. It ran all 19 route tests in `documents.generate-from-brief.test.ts` and every other drafting suite.
- Locally: `tsc --noEmit` clean. `eslint` no errors. `prettier --check` clean. `brief-drafter.test.ts`, 45 tests, passed.
- The first CI run failed on 4 route tests and the second on 1. Both were mistakes in the tests (facts that did not support the ground chosen; a wrong guess about the verification text). The code was not changed for them.

### What was not run

- No call to the real model. The quality of a real draft is not tested.
- No browser check.
- No separate review. The same agent wrote the code and the tests.
- `gitleaks` is not installed where the commits were made, so the commit hook skipped the secret scan. A pattern search of the diff found nothing.

## Delivery report — part 2 (Vishal, from the war-room chat, 6 Oct 2026, 14:1x)

Pull request: https://github.com/lawie-in/lawie/pull/44 into `develop`. CI passed for Drafting, Billing, Auth and Gateway. All four ran because `packages/shared` changed.

### What is built

- `POST /documents/generate-from-brief` takes `kind: "none"`, with `kind_name` and `court_document` as the brief step returns them.
- The Drafter writes the whole document from the confirmed brief under Ajay's prompt for a request with no rule pack (T-107, section 6), copied into code by script. The mode is always strict.
- The draft always carries the starting-draft label, with no line under it. The PDF footer follows from the label.
- The free checks run and their findings are shown: old-law references, section numbers, a name that is not in the draft as written, and a date or section that is not in the brief.
- Saved with the type `guided` (added to `packages/shared`), the brief encrypted, one `Generation` row per attempt, one charge of 1 Ink, a failed run charges nothing.
- A demand signal, `demand.guided_draft`, for every such draft. It holds the run, the intake id and whether it is a court document, and none of the user's words.
- A court signal in the user's own words (T-107, section 2) makes it a court document whatever the browser sent. This rule now also runs in the brief update (`updateBrief`, part of T-105), so the brief screen and the draft step agree.
- Nothing for the Supreme Court is drafted without a rule pack: the route answers `no_match`.

### Acceptance criteria, now

- Met by part 1 and part 2 together: drafting with and without a pack; one Drafter call; unknowns as blanks; the clause check and one repair pass with a pack; the label rules; the records; the demand signal; the tests named in the ticket.
- Still not met: the label in the **DOCX** footer (the export is made in the browser, T-125). "Estimate before drafting" is the fixed cost per document, as before. The gate in T-113 has not been run, so the route stays closed.

### Differences from the ticket, and things for Ajay

- `sections_given`, which rule 3 of the prompt relies on, is read by code from what the advocate typed. The patterns are Vishal's, not signed text.
- The saved title of a guided document is the document's name from the brief. It is not encrypted and the user can type it. The Ink ledger line says only "Starting draft".
- The court-signal list is wide ("stay", "suit", "appeal", "commission", "execution"). A plain letter that uses one of those words is treated as a court document and asks for a court.
- Not built from T-107, section 3: refusing forms that a law prescribes in a fixed format. T-105 did not build it either.
- Light mode is not used (T-127, section 3.1).

### One fault fixed on the way

The fact check that existed before this ticket read "04/2026" inside the date "01/04/2026" as an FIR number and reported it missing when the draft wrote the date with dots. With a rule pack that would have put the label on a clean draft. Fixed in `checkFactAlteration`.

### What was run

- CI: all four test jobs passed on the first run, including the new route tests for the no-pack path.
- In the chat session: type check, lint with no errors, prettier, `brief-drafter.test.ts` (64 tests), the 18 suites that need no database. The no-pack drafting function was also run with the test fixtures and a stubbed model.

### What was not run

- No call to the real model. No browser check. No separate review.
- `gitleaks` is not installed in the chat session, so the commit hook skipped the secret scan.
