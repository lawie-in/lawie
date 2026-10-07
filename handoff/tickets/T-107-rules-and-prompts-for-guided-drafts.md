# T-107 — Rules and prompts for guided drafts

| Field      | Value                                                     |
| ---------- | --------------------------------------------------------- |
| Phase      | 1 — Describe-first intake                                 |
| Owner      | Ajay                                                      |
| Mode       | Legal work, not through the dev lead                      |
| Status     | Delivered and signed by Ajay on 4 Oct 2026, on conditions |
| Depends on | None                                                      |
| Branch     | None                                                      |
| Created    | 2026-10-04                                                |

## Goal

The legal rules and the three prompts that make a draft without a template acceptable.

## Context

- Founder, 4 Oct 2026: guided drafts replace the "no match" dead end, and Ajay is to confirm the rules precisely.
- Ajay's conditions so far are in ADR-019, section 4.3. They are not signed.
- A court document drafted without a template has no format guarantee and none of the template's mandatory clauses.
- The June BUILD SPEC v2 already asked for a memory-mode prompt (SCRUM-108): no invented section numbers, placeholders over guesses.
- Founder, 4 Oct 2026 (01:59): no Reviewer step in the pipeline. The review is a paid option (T-111). The prompts needed are Reception, Drafter and the optional review.
- Ajay's updated conditions are in ADR-019, section 4.3: the free rule checks always run, and the review offer is shown on strict-mode drafts.

## Acceptance criteria

- The closed list of low-risk kinds that may use light mode.
- The list of court signals that force strict mode.
- Any kinds of document that must never be drafted without a template.
- The three prompts, written or reviewed by Ajay: Reception, Drafter, Reviewer.
- The checklist for the optional review: what it looks for and how the points are worded for the user.
- The exact wording of the label and of the citation placeholder.
- The changes needed in the terms of use and the disclaimer, handed to T-204.
- A sign-off reference that T-105 and T-106 can quote.

## In scope

- The lists, the prompts and the sign-off, saved in this file or linked from it

## Out of scope

- Code

## References

- Design: Not needed
- ADR: `docs/adr/ADR-019-intake-and-routing.md`, approved by the founder on 4 Oct 2026, sections 3.14 and 4.3
- Legal sign-off: Ajay, T-107, 4 Oct 2026. See `handoff/design/T-107-guided-draft-rules-and-prompts.md`, section 9

## Result (Ajay, 4 Oct 2026)

Delivered in `handoff/design/T-107-guided-draft-rules-and-prompts.md`:

- The closed list of 8 low-risk kinds for light mode.
- The court signals that force strict mode, in English and Hindi.
- Three kinds that are never drafted without a template.
- The exact label, footer and placeholder wording.
- The Reception, Drafter and optional Review prompts, with the server checks that follow each.
- The terms text for T-204.
- The sign-off and its six conditions.
