# T-366 — Copy and free-tool legal lines

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (web) + Ajay (legal lines) + Madhuri (copy) |
| Mode   | Small fix |
| Status | To do. RELEASE GATE for main (Anushka FAIL). Unassigned. Priya, 13 Oct 2026 |
| Source | Anushka run 3 FAIL, 13 Oct 2026 (handoff/quality/2026-10-13-run-3-develop-FAIL.md). Failed entries: T-317, T-306 |

## Acceptance criteria

1. Use the lines already signed (handoff/marketing/copy/site-copy-t252.md rows F2 and A8; Ajay's sign-off in handoff/legal/site-copy-t252-and-help-text-signed.md):
   - FAQ free tier (faq/page.tsx ~L53): "5 Ink on sign-up (lifetime). All document types, PDF and DOCX export. Criminal drafts use BNS, BNSS and BSA section numbers."
   - About (~L84-85): "Exports the draft as PDF or DOCX."
2. Tools card: bailable offence → S.478 BNSS, not S.480.
3. 377 IPC note: "read down" in Navtej, not "struck down" (Ajay's line).
4. Home page tab title matches the signed-in pages' pattern.
5. Ajay signs 2 and 3.

Anushka's reproduce steps are in the run 3 report; use them as the test cases. Anushka re-tests on develop after merge.
