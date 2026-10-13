# T-366 — Copy and free-tool legal lines

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (web) + Ajay (legal lines) + Madhuri (copy) |
| Mode   | Small fix |
| Status | Building. Tanvi, after T-375. Priya, 13 Oct 2026 |
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

## Ajay (13 Oct 2026)

Ajay signed (51175aa, handoff/legal/): S.478 BNSS on the Tools card; the 377 note says "read down" in Navtej.

## Ajay, Addendum 1 (985f092, handoff/legal/T-366-tools-legal-lines-signed.md)

This replaces the FAQ line in AC1: "5 Ink on sign-up, once your email is verified (lifetime). All document types, PDF and DOCX export. Criminal drafts use BNS, BNSS and BSA section numbers." The same qualifier goes on every other page that promises 5 Ink on sign-up (pricing, home, sign-up). The lead greps for them.
