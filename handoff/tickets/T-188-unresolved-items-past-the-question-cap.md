# T-188 — Unresolved ledger items past the question cap are never silently guessed

| Field          | Value                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------ |
| Phase          | 1 — Describe and draft                                                                                             |
| Owner          | Arjun (which option, and the design) and Ajay (legal sign-off on the option and on any marker text). Vishal builds |
| Mode           | Decision first (Arjun + Ajay), then build (developer + reviewer + tester)                                          |
| Status         | To do. Waits for Arjun and Ajay to choose option A or B. Gates `feature.fact_ledger` for real users               |
| Size           | Decision S (0.5 day, Arjun + Ajay). Build: option A is S (0.5 day), option B is M (1 day)                          |
| Depends on     | T-147b                                                                                                             |
| Blocks         | Switching `feature.fact_ledger` on for any real user. Same gate group as T-187 and T-147c                           |
| Branch         | feature/t-188-unresolved-past-question-cap (build part only)                                                       |
| Legal sign-off | Needed. Ajay signs the chosen option. If option A, he also signs the exact marker string and where it is printed   |
| Created        | 2026-10-10                                                                                                         |
| Source         | Ajay's condition on T-147b, 10 Oct 2026                                                                            |

## Goal

Every unresolved ledger item is either asked or visibly marked in the draft. None is filled with Reception's value without the advocate seeing it.

## Context

- Ajay, 10 Oct 2026: brief questions are capped at 10 per round. When the ledger has more than 10 unresolved items, the items past the cap keep Reception's value and are never asked.
- That value is a guess. It breaks T-147b AC5 for those items: "A value the normalizer cannot resolve appears in `unresolved` with its reason and is asked. It is never stored as a fact with a guessed value."
- The cap itself stays. This ticket is about what happens to the items past it.
- Two options. Arjun and Ajay choose one:
  - **Option A, mark:** each dropped item prints in the draft as `[verify: unread in source]` in place of a value.
  - **Option B, ask later:** the items past the cap are asked in a later round of questions before drafting.

## Acceptance criteria

**Decision (Arjun and Ajay, written in this file)**

1. The chosen option, A or B, is written here with the reason, and Ajay signs it.
2. If A: Ajay signs the exact marker string and says where it prints (in the paragraph where the value would go). Any marker that lands in a legal-content path goes through his diff gate.
3. If B: Arjun sets the most rounds allowed, and what happens to items still unresolved after the last round. That fallback must be option A's marker, never a guess.

**Build (Vishal, after 1 to 3)**

4. Test with 11 or more unresolved items: no item past the cap ends up as a ledger fact with Reception's value. Each one is still in `unresolved` with its reason.
5. If A: every such item prints in the draft as the signed marker, and the draft shows no value for it. A test checks the draft text for each item.
6. If B: every such item is asked in a later round. Once answered, it becomes a fact with `source: "asked"` and a `raw_span` taken from the answer (T-147b AC2 and AC3).
7. The brief shows every unresolved item as outstanding, including the ones past the cap (T-147b AC6). What the brief shows and what the Drafter receives stay the same set.
8. Test with 10 or fewer unresolved items: behaviour is unchanged.
9. No prompt text changes unless Ajay signs the diff.

**Gate**

10. `feature.fact_ledger` stays off for every real user until 1 to 9 are done. Arjun confirms this in this file.

## In scope

- How brief questions are capped and rounded in `apps/drafting/src/services/intake.service.ts` and `intake-brief.ts`
- Option A: where the marker is printed in the draft (with T-147c's input contract)
- Option B: the extra round in the brief flow (`apps/web/src/components/intake/BriefStep.tsx`)
- Tests for 4 to 8

## Out of scope

- Changing the cap of 10
- The verifier (T-147d)
- Retention of ledger data (T-187)

## References

- T-147b (AC2, AC3, AC5, AC6), T-147c, T-187
- ADR-022
