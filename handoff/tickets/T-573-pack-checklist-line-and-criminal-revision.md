# T-573: Pack follow-ups from Ajay's T-566 approval

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (before main; parked until after Anushka's first run) |
| Owner  | Shashank (build, drafting rule packs), Ajay (byte-check) |
| Mode   | Full chain (legal content, drafting) |
| Status | To do. Raised by Ajay's T-566 approval (18f7112c), 22 Oct 2026. Priya |
| Source | Ajay's note on T-566; `handoff/legal/pre-anushka-legal-review-22-oct.md` items 64 and 65 |

## Acceptance criteria
1. Delete the checklist line "Disclaimer slip — Lawie drafting assistance acknowledged" from the ~36 rule packs that still carry it (`apps/drafting/src/config/document-rules/*.json`). Grep first and list the exact files for Ajay.
2. Apply items 64 and 65 to `criminal_revision.json` after Mahak's T-472 has merged (Mahak holds that file until then). Same signed text as the other packs.
3. Golden snapshot: no change expected; if it moves, list why for Ajay.
4. Tests green; Ajay byte-checks.

## Files
Claimed by Priya when Shashank takes it. `criminal_revision.json` only after T-472 is merged.

## More follow-ups from Shashank's T-566 report (22 Oct 2026), all parked until after Anushka's first run
3. Validator date-scoping, after Mahak's T-472/T-567 (needs `ai.service.ts`).
4. Retire `prompt-assembler`.
5. Stale S.M.S. Pharmaceuticals comments in `ai.service.ts`.
6. Sample PDFs: regenerate on a non-prod DB; Ajay re-signs each one; fix the rent-agreement shared address then.
7. One golden-set real-model run (paid) after all drafting merges, read per fixture. This one is NOT parked: run it once before Anushka (see Priya's note to Shashank), because she tests generated drafts.
