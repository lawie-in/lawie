# T-566: Legal fixes, text inside and around the draft (review section D)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (MUST items block Anushka's browser run) |
| Owner  | Lead (build, drafting), Arjun for prompt design, Ajay byte-checks |
| Mode   | Full chain (drafting, legal content; read .claude/docs/golden-snapshots.md first) |
| Status | To do. Shashank (pauses T-534). MUST before Anushka. Priya, 22 Oct 2026 |
| Source | Ajay's pre-Anushka legal review: `handoff/legal/pre-anushka-legal-review-22-oct.md` (22 Oct 2026, b871e0f7) |

## Items
Review section D: **54 to 65 MUST**, 66 to 72 SHOULD (do them too). 54: the live form-path system prompt (`template-engine.service.ts`) says "NEVER reference old IPC...": replace with the signed date-aware instruction. 55: "court-ready" persona line (this carries AJ-557-M3). 56 to 63: pack labels and instructions that forbid IPC (fir_quashing, quashing_528_bnss, mact_claim, surrender_application, suspension_of_sentence, memo_of_parties, vakalatnama, affidavit_identity, legal_notice_defamation). 64: delete every "Cite <case>" instruction in discharge_application, habeas_corpus, slp and add the T-441 line. 65: delete the three kinds of disclaimer instruction inside the pleading (~49 packs, ~38 mandatory clauses, four structure items) and add 'Lawie is a drafting assistant' to the body strip filters as a safety net. 66: retire prompt-assembler.ts. 67 to 72 as listed (71: seed-sample-pdfs placeholders; 72: gpa.json case law). Golden snapshots will move: regenerate only where they move, show the diff to Ajay. Mahak's T-472 touches criminal_revision.json, limitation.service and the ai.service.ts call site: avoid those, merge origin after her merge. Golden-set runs are noisy (real model).

## Rules for every item
Signed fix text is in the review file next to its item number (file:line, current text, signed fix). Paste it **byte for byte**; if a line has moved, find it by the current text. Anything unclear goes to the real Ajay (session_019mZoKeM2MTfCyV5HEZrqnZ), never invented. Files under `.claude/docs/legal-content-paths.md` come back to Ajay for a byte check at READY. Do not touch files held by another lead's claim row; wait for their merge or ask Priya.
