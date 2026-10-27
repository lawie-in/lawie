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

## Explore (Shashank, 26 Oct 2026, read-only; lines at origin/develop_staging 7f080192)
Headline: the O.39 fields exist only on fix/t-613-o39-injunction, so T-629 branches after T-611, T-612 and T-613 merge. There is no askedAt anywhere in code. main_suit_relief already falls in RELIEF (intake-brief.ts:457); only restraint_sought moves.

Decisions (Priya, 26 Oct): AC5's asked-blank mechanism is owned by T-629, built once. HI is a {en, hi} constant with EN rendered (AJ-622-M1 precedent). A ledger- or description-read value lifts the blocker, as parties do. Add a fail-closed test that every blocks_confirm field has a signed message.

**AC1 blocks_confirm**
- Pack: "blocks_confirm": true on main_suit_relief and restraint_sought (L).
- rule-pack.service.ts: RulePackFact :60-62 and packQuestion :247-253 (ask Ajay first).
- intake-brief.ts (L):
  - ChecklistItem :71-73
  - buildChecklist :631-632
  - BriefItem :106-107
  - item build :1546-1548
  - Brief.confirm_blockers :145 ('required_fields')
  - confirmState :1611-1641; compute the blocker outside the courtDocument guard
  - withoutLedgerGiven :1341-1350 reuses confirmState
- Backstop: documents.routes.ts:1627-1637 already returns 400 brief_not_confirmed.

**AC2 messages:** CONFIRM_BLOCK_MESSAGES {en, hi} in intake-brief.ts, serving en, plus a stable code on the wire (confirm_blocking_key). This is also the HI home for T-628.

**AC3 web**
- BriefStep.tsx :596-601: briefCanConfirm ignores required_fields when parties are lifted.
- BriefStep.tsx :604-608: the message shown is wrong.
- BriefStep.tsx :669-694: focusFirstBlocker has no required-field branch.
- briefTypes.ts :74 union and :26-52 BriefItem.

**AC4 relief part**
- partOf intake-brief.ts:507-516, RELIEF :457: add "restraint", or use an exact-key set.
- Do NOT widen to `_sought`; it would move suspension_of_sentence_sought, interim_custody_sought, waiver_of_cooling_period_sought and ex_parte_sought.
- Downstream: brief-drafter.ts:287 asked_for; PART_ORDER (briefTypes.ts:551; buildQuestions :1917).

**AC5 blank once asked**
- Server: buildBrief :1473 skips empty values; isNoFactAnswer :1230-1241 is false for ''.
- Web never sends a blank: QuestionsStep.tsx:80-81; briefTypes withValue :491-498 and valuesAfter :376-382; OneFlow.tsx:653.
- Do NOT reuse asked_empty. brief-drafter.ts:78-92, draft-renderer.ts:1062-1067 and ai.service.ts:2058 would force the T-440 blank. Use a new marker (asked_blank) plus asked_keys in brief/update.
- Hunks: QuestionsStep :76-82; OneFlow answerQuestions :645-667; valuesAfter; intake-brief buildBrief :1468-1498 and :1548; buildQuestions :1886; the documents.routes brief/update schema.

**AC6:** T-611 fact_needed covers held blanks only. The route gate plus confirmState stops unheld empties. An in-draft check is Ajay's call.

**Overlap**
- T-611: inserts at ChecklistItem :73 and buildChecklist :632. No conflict if branched after it merges; put blocksConfirm after notInDraft.
- T-612:
  - partOf: medium risk.
  - NONE_ANSWERS/NONE_IS_EMPTY :1200-1222: high risk.
  - BriefStep and OneFlow answerQuestions: high risk.

**Files**
- Pack; rule-pack.service.ts; intake-brief.ts; brief-drafter.ts and the documents.routes brief/update schema (for AC5).
- Web: BriefStep.tsx, briefTypes.ts, QuestionsStep.tsx, OneFlow.tsx.
- Tests: intake-brief, rule-pack, t613, new t629-confirm-block, t440 if touched; web BriefStep.t629 and the OneFlow/QuestionsStep blank-answered tests.

**Open for Ajay**
- (2) combined-message precedence
- (3) does a typed "Not known" still block?
- (5) is an in-draft check wanted?
- does a "Not known" chip on title_document_date force the T-440 blank?

## Added AC (Ajay FR-5a, 04f5aa77, 27 Oct 2026)
- AC8: T-629 also enforces the O.39 required fields (main_suit_relief, restraint_sought) and the §(j)3 non-answer list on the Templates form route (generate-from-template), before generation, with the signed messages in §(j)2 order. Use T-637's hook.
