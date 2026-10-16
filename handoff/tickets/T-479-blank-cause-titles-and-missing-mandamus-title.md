# T-479: Cause titles are blank although the names were given

| Field  | Value |
| ------ | ----- |
| Status | To do. V1 (major). Priya, 16 Oct 2026 |
| Owner  | Shashank (after T-221), Ajay gates wording |
| Mode   | Full chain (legal content path) |

## Source

Anushka quality run 4 on develop, 16 Oct 2026 (handoff/quality/2026-10-16-run-4-develop-FAIL.md). Priya triaged it on 16 Oct 2026.

## What Anushka saw

Blank cause title on both sides ("_____ ... Petitioner VERSUS _____ ... Respondents") in the habeas, quashing, revision and regular bail case number, although the names were given. The mandamus draft has no cause title at all, and its heading reads "ART. 226/32". The certiorari opens before the court heading and cause title and does not make the State a respondent.

## What

Explore: where the party names go from the brief to the cause title (ledger fields? form fields? template placeholders?). Fix so given names fill the title; add the title to mandamus; make the State a respondent in certiorari. Ajay approves any wording. Tests per pack; golden check.

## Acceptance criteria

- Given petitioner and respondent names appear in the cause title in habeas, quashing, revision, regular bail, mandamus, certiorari.
- Tests pin it; Ajay's ref.


## Ajay's ruling (16 Oct 2026)

No new wording needed: T-404 applies. Mandamus uses the writ_civil title.
