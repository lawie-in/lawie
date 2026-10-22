# T-489: Mandamus form needs its own fields: the statute that imposes the duty, and the grievance

| Field  | Value |
| ------ | ----- |
| Status | Merged into develop_staging a39c2f6d (17 Oct 2026). Priya |
| Owner  | Lead who is free; Ajay writes the labels and the paragraph text |
| Mode   | Full chain (legal content) |

## Source

Shashank, T-479 (16 Oct 2026): the mandamus pack has no statute_invoked or grievance_summary fields (they were copied from the civil writ pack, so mandamus drafts ask for nothing). In T-479 the placeholders print signed blanks "[To be confirmed: ...]". Ajay: ticket the real form fields for later.

## What

Add two fields to the mandamus form: the statute imposing the duty, and the grievance. Ajay supplies labels and how each is used in the draft (locus standi, legal right, demand, inaction paragraphs). Replace the T-479 blanks with the answers.

## Acceptance criteria

- Mandamus asks both fields; the draft uses them; empty keeps the signed blank.
- Tests; Ajay's ref.
