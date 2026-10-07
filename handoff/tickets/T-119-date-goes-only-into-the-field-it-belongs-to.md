# T-119 — A date is filled only into the field it belongs to

| Field      | Value                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------ |
| Phase      | 1 — Describe-first intake                                                                              |
| Owner      | Vishal. Ajay writes the rule and signs. Arjun confirms the approach                                    |
| Mode       | Full chain                                                                                             |
| Status     | Closed on 5 Oct 2026, not built. ADR-021 is approved; its work is in T-105 (dates carry their meaning) |
| Depends on | None                                                                                                   |
| Branch     | fix/t-119-date-field-assignment                                                                        |
| Created    | 2026-10-05                                                                                             |

## Goal

The arrest date in a description never ends up as the FIR Date, or as any other date the user did not give.

## Context

- Finding 1 of the end-to-end check, `handoff/manual-checks/T-103-T-104-e2e-result.md`.
- Text: "…was arrested on 15/03/2026 in FIR No. 124/2026 at Kotwali police station…". Result on the review screen: FIR Date = 15/03/2026, marked ready. The description gives no FIR date.
- Seen again with the founder's text: "…arrested by Sadar Thana Police on 25th August 2026…" gave FIR Date = 25/08/2026, in 2 runs out of 2.
- Why the server check passes: it confirms the date appears in the quote. It cannot tell which date field the date belongs to.
- `bail_regular` has two date fields: `fir_date` (required) and `custody_since`. Filling `custody_since` from the arrest date is right.
- ADR-019, rule 4.1.1: a value is filled only when the description states it.

## Acceptance criteria

- With both texts above, FIR Date is empty, shown as "Needs your input", and asked in the follow-up questions. "In custody since" may be filled.
- With "FIR No. 124/2026 dated 10/03/2026, arrested on 15/03/2026", FIR Date = 10/03/2026 and In custody since = 15/03/2026.
- One date in the description is never used for two date fields unless the description says so for both.
- A date the model filled is shown as "to confirm" on the review screen, not "ready". The user confirms it, as for a value read from an image.
- The rule is enforced by the server, not only by the prompt.
- Tests cover the three texts above and one Hindi or Hinglish text supplied by Ajay.
- The same check is applied to every template that has more than one date field. The list of those templates is written in this file.

## Approach (Arjun to confirm before the build)

- Each date field gets a short list of cue words in its template config, written by Ajay (for `fir_date`: "FIR dated", "FIR lodged on", "FIR registered on"). The server keeps a model-filled date only when the quote contains a cue for that field.
- A date field with no cue list is never filled by the model. It is asked.

## In scope

- `apps/drafting/src/services/intake.service.ts`
- `apps/drafting/src/services/intake.prompts.ts` (legal content)
- Date-field cue lists in the template configs under `apps/drafting/src/config/document-rules/` (legal content)
- The "to confirm" state for model-filled dates on the review screen (`apps/web`)

## Out of scope

- Other field types. Names landing in the wrong field were handled by Ajay's change in T-101.
- Reading dates from images (T-301)

## References

- Design: Not needed
- ADR: `docs/adr/ADR-019-intake-and-routing.md`, sections 3.5 and 4.1
- Legal sign-off: Needed from Ajay before merge. He writes the cue lists and reads the final prompt text
