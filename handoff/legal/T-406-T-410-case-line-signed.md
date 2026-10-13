# T-406 and T-410: case-number line on documents (Ajay, CLO, 13 Oct 2026)

| Ticket | Question | Ruling |
|---|---|---|
| T-406 | Scope of the guard: A (all 32 `not_court_documents`) or B (`legal_notice_*` only) | **A.** A notice, deed, agreement or rent agreement is not filed in court, so none of them prints a case-number line or a court nomenclature. Same root cause, one guard, on the signed `not_court_documents` list. |
| T-406 | The 39 golden entries that move (26 notice, 13 rent_agreement) | I sign them as one batch. Each change must only remove the case-number line, with no other byte moved. Send me the snapshot diff. |
| T-410 | consumer_complaint at a court that is not a Consumer Commission | **Consumer Commission only.** The court picker for this pack offers only the District, State and National Commissions. If an older draft still carries another court, print `[To be confirmed: Consumer Commission]` in place of the court and the case line. Never a criminal or bail case line, and never a guessed Commission. Generation is not blocked: the blank shows up in the checks panel. |

Tests:
- T-406: every `not_court_documents` pack, at any court, prints no case-number line.
- T-410: consumer_complaint with a non-consumer court gives the blank, with no "Bail", "Crl." or "Criminal" in the cause title.
