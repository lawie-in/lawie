# T-566: Legal fixes, text inside and around the draft (review section D)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (MUST items block Anushka's browser run) |
| Owner  | Lead (build, drafting), Arjun for prompt design, Ajay byte-checks |
| Mode   | Full chain (drafting, legal content; read .claude/docs/golden-snapshots.md first) |
| Status | Merged into develop_staging ee7dea1f (Shashank, 22 Oct 2026; CI 974/975 green). Follow-ups in T-573 (parked). One golden-set real-model run still to do after the drafting merges. Priya |
| Source | Ajay's pre-Anushka legal review: `handoff/legal/pre-anushka-legal-review-22-oct.md` (22 Oct 2026, b871e0f7) |

## Items
Review section D: **54 to 65 MUST**, 66 to 72 SHOULD (do them too). 54: the live form-path system prompt (`template-engine.service.ts`) says "NEVER reference old IPC...": replace with the signed date-aware instruction. 55: "court-ready" persona line (this carries AJ-557-M3). 56 to 63: pack labels and instructions that forbid IPC (fir_quashing, quashing_528_bnss, mact_claim, surrender_application, suspension_of_sentence, memo_of_parties, vakalatnama, affidavit_identity, legal_notice_defamation). 64: delete every "Cite <case>" instruction in discharge_application, habeas_corpus, slp and add the T-441 line. 65: delete the three kinds of disclaimer instruction inside the pleading (~49 packs, ~38 mandatory clauses, four structure items) and add 'Lawie is a drafting assistant' to the body strip filters as a safety net. 66: retire prompt-assembler.ts. 67 to 72 as listed (71: seed-sample-pdfs placeholders; 72: gpa.json case law). Golden snapshots will move: regenerate only where they move, show the diff to Ajay. Mahak's T-472 touches criminal_revision.json, limitation.service and the ai.service.ts call site: avoid those, merge origin after her merge. Golden-set runs are noisy (real model).

## Rules for every item
Signed fix text is in the review file next to its item number (file:line, current text, signed fix). Paste it **byte for byte**; if a line has moved, find it by the current text. Anything unclear goes to the real Ajay (session_019mZoKeM2MTfCyV5HEZrqnZ), never invented. Files under `.claude/docs/legal-content-paths.md` come back to Ajay for a byte check at READY. Do not touch files held by another lead's claim row; wait for their merge or ask Priya.

## Arjun (22 Oct 2026) — five design calls (Shashank)

1. **Ship item 54 now; blanks are the safe failure.** A "[To be confirmed: section and code]" is a correct output for a pack with no offence date; a guessed code is not. Feeding the date the T-245a way is a follow-up. The `old_law_reference` validator warning stays untouched until Ajay says whether it is in scope; a rule-vs-warning contradiction becomes its own small ticket, not a scope creep here.
2. Item 65: **(a)** accept — a clause we never want is deleted from the lists, the T-200 checks and `needsStartingDraftLabel` follow. **(b)** drop the matching sentence or line, not the paragraph, if it is a contained change (≈ 20 lines); otherwise accept the paragraph drop and note it. **(c)** accept for now — the streamed-chunk flash is the V1.1 "sanitise streamed chunks" ticket Priya already holds; link it. **(d)** yes, `isDisclaimer` on the brief path too, pending Ajay.
3. **Keep `prompt-assembler.ts`**; apply the 54/55 text only. Retirement is a follow-up after Mahak's T-472/T-567 merge (it touches `ai.service.ts`, which is hers). The t182 sha256 pin moves with the text, recorded in the report.
4. **One real-model golden run** after all pack edits are on the branch; read failures per fixture against the touched packs, never by totals (T-453 rule, ±2 variance).
5. Item 64: keep the proposition, drop only the case name, if Ajay agrees, so the T-429 NI-Act gate keeps working; adjust the t429 tests.
Full chain; Ajay byte-checks at READY. Go.

## Arjun (22 Oct 2026) — item 54d blocked in the claim: (a) + (b), pending Ajay

Fact: the validator never sees the offence date; passing it through is in `ai.service.ts` (Mahak's, T-472/T-567). So:
- **(a)** a small ticket after Mahak merges: pass the form/preflight offence date into `validate`/`checkDraftCitations`, show Ajay's signed 54d text only when the date is on or after 1 July 2024 or unknown. T-566 ships without 54d.
- **(b)** interim in T-566, `validator.ts` only: the old "Use Section X BNS instead" warning is **suppressed** — it now contradicts the item-54 rule for pre-July-2024 offences, and a wrong legal warning is worse than none. The loss is bounded: item 54 moves the date logic into the prompt, so the model, which does see the date when a pack has one, applies it; the validator check returns with (a). **Needs Ajay's OK** (it removes a warning). If he prefers a warning to stay, the fallback is a neutral line he signs ("This draft cites Section X IPC. Confirm the offence date: BNS applies to offences on or after 1 July 2024.") shown whenever an IPC citation appears — it asserts nothing about replacement.
- (c) rejected: it would show the "replaced" text for earlier offences, which Ajay forbade.
Recorded as an open legal item on T-566 until Ajay answers; the rest of the ticket proceeds.

## Arjun (22 Oct 2026) — 54d resolved by Ajay (S11)

Ajay's S11 supersedes (b): no suppression. The validator message becomes his signed, unscoped text, "Check the code: Section {x} BNS replaced Section {y} IPC for an offence on or after 1 July 2024." — true for any offence date, so no wrong advice is possible. Applied in T-566, `validator.ts` message only. (a) stands: date-scoping (hide it for an offence before 1 July 2024) is the follow-up after Mahak merges. No objection.

## Arjun (22 Oct 2026) — 54d final: Ajay's S11a supersedes S11

Ajay's **S11a** (`handoff/legal/pre-anushka-legal-review-22-oct.md`) replaces S11: the validator shows, on any IPC citation, "This draft cites Section {x} IPC. Confirm the offence date: BNS applies to offences on or after 1 July 2024, IPC to offences before that date." The old "Use Section X BNS instead" goes. `validator.ts` message only; date-scoping remains the follow-up after Mahak merges. Shashank is applying it. Closed.
