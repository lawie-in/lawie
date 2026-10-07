# T-127 — Rules, prompts and cue lists for the one flow

| Field      | Value                                                                                                                   |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| Phase      | 1 — Describe and draft                                                                                                  |
| Owner      | Ajay                                                                                                                    |
| Mode       | Legal work, not through the dev lead                                                                                    |
| Status     | Delivered and signed by Ajay on 6 Oct 2026, with 5 conditions. See `handoff/design/T-127-one-flow-rules-and-prompts.md` |
| Depends on | None                                                                                                                    |
| Branch     | None                                                                                                                    |
| Created    | 2026-10-05                                                                                                              |

## Goal

The exact words and lists Vishal needs so that the one flow follows the rules Ajay signed in ADR-021, section 5.

## Context

- ADR-021, approved by the founder on 5 Oct 2026. Ajay signed section 5 the same day.
- T-107 holds the Reception, Drafter and Review prompts for requests with no template. They are the base. This ticket changes them for requests that have a rule pack.
- T-122 needs two cue lists for bail. T-105 needs the words that give a date its meaning.

## Acceptance criteria

- **Reception prompt**, changed so that with a rule pack it asks only from the checklist it is given, and never drafts.
- **Drafter prompt**, changed so that it writes under the pack: every mandatory clause covered, the pack's instructions followed, nothing outside the brief.
- **Bail cue lists** in English, Hindi and Hinglish: words that mean the person is already arrested or in custody, and words that mean arrest is expected.
- **Date meanings**: for each kind of date the packs use (FIR, arrest, custody, notice, agreement, incident, filing and the rest), the words that tie a date to it, in English, Hindi and Hinglish.
- **Wording** for the "please check" mark and for the state where Confirm is off on a court document.
- Everything is written in `handoff/design/T-127-one-flow-rules-and-prompts.md`, with Ajay's sign-off and its conditions at the end.

## In scope

- The document above

## Out of scope

- Changing any rule pack (T-128)
- Prices and terms (T-204)

## References

- ADR: `docs/adr/ADR-021-one-drafting-flow.md`, section 5
- Base: `handoff/design/T-107-guided-draft-rules-and-prompts.md`

## Delivery (Ajay, 6 Oct 2026)

- Document: `handoff/design/T-127-one-flow-rules-and-prompts.md`.
- Lists for the code: `handoff/data/T-127-bail-cues.json` and `handoff/data/T-127-date-meanings.json`.

| Criterion                                            | Result                                                                |
| ---------------------------------------------------- | --------------------------------------------------------------------- |
| Reception prompt for a request with a rule pack      | Section 3                                                             |
| Drafter prompt for a request with a rule pack        | Section 4. A repair prompt for decision D3 is added in 4.1            |
| Bail cue lists in English, Hindi and Hinglish        | Section 5: 79 cues for "already arrested", 98 for "expects arrest"    |
| Date meanings                                        | Section 6: 31 kinds of date, covering every date fact in the 92 packs |
| Wording for "please check" and for Confirm being off | Section 7, with the label wording for the draft                       |

Added beyond the ticket, because T-105 needs them: which packs are court documents (60 of 92), the four fixed checklist items, and the order of questions.

Open condition before real users: a practising advocate reads the Hindi and Hinglish lists and checks the judgments named in the packs. Both were written by the CLO agent.

Found on the way: 37 packs have no prayer template and 43 have no verification template, so the Drafter writes those parts. T-128 covers required facts only. This needs its own ticket.
