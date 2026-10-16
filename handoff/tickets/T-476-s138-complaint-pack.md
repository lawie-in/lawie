# T-476: A s.138 / s.141 complaint pack (the court document, after the notice)

| Field  | Value                                                              |
| ------ | ------------------------------------------------------------------ |
| Status | To do. V1.1 (not v1). Priya, 16 Oct 2026                            |
| Owner  | Lead (build), Ajay (writes and byte-checks the pack text)          |
| Mode   | Full chain (legal content, new pack)                                |

## Source

Anushka run 4 (16 Oct 2026) asked for the s.141 complaint paragraph for a company drawer. No s.138 complaint pack exists today: the notice (legal_notice_s138) is its own document. Ajay (16 Oct): the notice alone is fine for v1; ticket the complaint pack for v1.1.

## What

A new pack for the s.138 complaint, with the s.141 averments: one paragraph per accused person named by the advocate, role as a blank if not given, the firm or company as accused where it is the drawer. Same numbered-slot rule as the notice (up to 3, "add any others in the draft"; the draft never says the list is complete). Sole proprietorship: no s.141.

## Acceptance criteria

- Ajay writes the pack text; fixtures for individual, proprietorship, partnership, company.
- Golden set entries for each; Ajay's ref in the merge body.

## Ajay, 16 Oct 2026 (T-245 file b46848f0)

The "Accused No. {n}" sentences belong to the complaint, not the notice. T-471's notice uses his corrected notice wording; the "Accused" form moves into this pack.
