# T-677 — Section numbers stripped from titles: "SECTION A CPC", "Section NI Act" (Anushka Blocker 4)

Status: backlog, P1. Source: Anushka run 5, prod v1.2.2, 29 Oct 2026 (handoff/tickets/anushka-run5-prod-v1.2.2.md). FAIL verdict.

## Acceptance criteria
1. Caveat under s.148A CPC titled "CAVEAT PETITION UNDER SECTION A CPC". NI Act s.138 complaint titled "Section NI Act Complaint For Dishonoured Cheque". Section numbers, including alphanumeric ones (148A, 138, 482, 483), must survive into titles and body.
2. Find where the number is dropped (sanitiser, title builder or prompt) and fix it at that point.
3. Tests for 148A, 138 and one BNSS section (e.g. 483).

## Mode
Small fix (drafting), legal content (Ajay byte check).
