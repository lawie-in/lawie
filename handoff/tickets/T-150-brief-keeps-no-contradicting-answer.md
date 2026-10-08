# T-150 — The brief does not keep an answer that contradicts the description

| Field          | Value                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------- |
| Phase          | 1 — Describe and draft. MUST FIX before go-live                                                         |
| Owner          | Vishal (build), Ajay (rule), Anushka (tests on develop before GTM)                                      |
| Mode           | Fix, full chain                                                                                         |
| Status         | Ready for Vishal (build starts only with Ajay's signed reference, see below)                            |
| Depends on     | None. Same intake code as T-139 and T-134; do not take those in this branch                             |
| Branch         | fix/t-150-brief-keeps-no-contradicting-answer                                                           |
| Legal sign-off | NEEDED. Touches `apps/drafting/src/services/intake-brief.ts` (and `bail-guard.ts` if the warning lives there) |
| Created        | 2026-10-07                                                                                              |
| Source         | Anushka's run 2, 7 Oct 2026, finding 7 (scenarios 2 and 3)                                              |

## Goal

After "Edit my description", the brief reflects the new description. A regular bail never reaches the draft for a client marked "not in custody" without the advocate being told.

## What Anushka found

- Rewrote the description to "in judicial custody since 13 Sept 2026". Brief kept the old answer "No — anticipating arrest" beside "In custody since 13/09/2026", no "Please check" mark.
- Scenario 2: "No — anticipating arrest" sat under "Regular Bail Application" with no warning.

## What Ajay must sign (exact)

1. Rule A: when the description changes, an earlier typed answer that the new description contradicts is replaced by the new reading and marked "Please check". If the new description says nothing on that fact, the earlier answer stays.
2. Rule B: Regular bail + custody answer "No — anticipating arrest" (or no custody date) shows a "Please check" mark on custody with this text: "A regular bail application is for a client in custody. If your client is not yet arrested, you may need anticipatory bail." Warn, do not block.
3. Vishal sends Ajay the diff of both rule texts; Ajay replies with a dated sign-off line, quoted in the handoff packet.

## Acceptance criteria

1. Scenario 3, stubbed model: answer "No — anticipating arrest", then edit the description to "in judicial custody since 13 Sept 2026". Brief shows custody = in custody, 13/09/2026, marked "Please check". The old answer is gone.
2. Edit that does not mention custody: the earlier custody answer is kept unchanged, no mark.
3. Scenario 2, stubbed model: Regular bail + "No — anticipating arrest" shows the Rule B mark and text on the brief before "Confirm brief and continue".
4. Confirm is still possible after the warning (warn, not block); no Ink is spent before Confirm.
5. Anticipatory bail + "No — anticipating arrest": no warning.
6. Unit tests for 1, 2, 3 and 5 in `apps/drafting/src/__tests__/`. Existing conflict rule (ADR-019 4.1.5, two values in one reading) still passes.
7. Uses the existing "Please check" tag in `BriefStep.tsx`. No new component, no layout change.
8. Report lists what was run with the real model, or says it was not run.

## Out of scope

- Re-asking facts already given (T-139); asking which document (T-134); court list (T-140).
- Switching the document to anticipatory bail automatically.
- Any change to rule packs, prompts other than the two rules above, or the draft itself.
