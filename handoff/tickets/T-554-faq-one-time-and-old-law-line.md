# T-554: FAQ wording, "one time" and the old-law line

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (build), Ajay signs (signed text below) |
| Mode   | Small fix (web, legal content) |
| Status | In build: Vishal (22 Oct 2026). Priya |
| Source | Vishal's T-541 report; Ajay, 22 Oct 2026 (5ebfecb5) |

## Acceptance criteria
1. `apps/web/src/app/.../faq/page.tsx` lines ~48 and ~53: "(lifetime)" becomes "(one time)" for the free 5 Ink (AJ-511-M7). Hindi form checked against the signed copy.
2. Line ~53: "Criminal drafts use BNS, BNSS and BSA section numbers." becomes, byte for byte, "Criminal drafts use BNS, BNSS and BSA section numbers, or IPC, CrPC and the Evidence Act where the old law applies."
3. Pin tests updated; a test compares the rendered sentence with the signed string. Ajay byte-checks at READY.
4. Housekeeping in the same branch if trivial: `.claude/docs/legal-content-paths.md` lists `terms/page.tsx` and `nl-copy.ts` (Ajay confirms the list text); README's Terms version line. Code comments and admin labels that still say "permanent" or "non-expiring" for top-up Ink: list them in READY, do not change admin labels without Priya.
