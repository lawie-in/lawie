# T-629: O.39 Part C — required fields block Confirm; restraint_sought in relief

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (legal; ships with T-613) |
| Owner  | shashank, after T-611 and T-612 merge (they hold intake-brief.ts hunks) |
| Mode   | Full chain; legal (intake-brief.ts, rule-pack.service.ts) |
| Status | To do. Split from T-613, 26 Oct 2026 (Ajay R2-F1 12914711). Priya |

## Acceptance criteria
1. A pack field flag `blocks_confirm: true`, carried through rule-pack.service.ts (ask Ajay first) to the checklist, BriefItem and the confirm_blockers type. confirmState blocks Confirm while main_suit_relief or restraint_sought is empty.
2. Confirm messages are Ajay's ff25b862 strings, EN and HI, byte for byte, with a locale home for HI.
3. Web: fix BriefStep.tsx:601. `briefCanConfirm` must not re-enable Confirm when the blockers include required fields.
4. restraint_sought moves to the brief's RELIEF part (Ajay d1e657cf); acts_complained_of stays in facts.
5. title_document_date: blank once asked counts as answered and renders nothing (Ajay 0d38b724).
6. If a blank for either required field still reaches a draft, that is a blocking finding and is never model-filled (Ajay R2-F1).
7. Ajay byte-checks the hunks at READY.
