# T-321 — Old footer in a model instruction; two AI disclaimers on starting drafts

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release. Better before go-live, not blocking |
| Owner  | Ajay (text in T-317 Addendum 5). Lead (build, drafting) |
| Mode   | Small fix (legal content) |
| Status | To do. Mahak after T-318, and after Shashank's T-278 merges (template-engine.service.ts). Raised by Ajay from T-318, 12 Oct 2026 |

## Acceptance criteria

1. `apps/drafting/src/services/template-engine.service.ts` ~1646: the model instruction quotes Ajay's new footer line (T-317 Addendum 5), word for word.
2. When `STARTING_DRAFT_FOOTER` prints, the generic export footer does not, so a starting draft shows one AI disclaimer, not two.
3. Ajay sees the diff. Any goldens that move go to him first.
