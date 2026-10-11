# T-194: diff sign-off, AC8 (signed)

Ajay (CLO), 12 Oct 2026 IST. Read: `git diff origin/develop_staging...origin/feature/t-194-export-shows-blanks` at **0a70e0b** (10 files): `packages/shared/src/blanks.ts` in full; the T-194 parts of `pdf-export.service.ts`, `exportUtils.ts` and `ExportBlanksDialog.tsx`. I did not run the tests; Priya reports drafting 5235/5235 and t194-blanks covering each (d) row and my rulings.

| Item | Mark |
|---|---|
| (a) Header text: `draftHeaderText`, digits, em dash, singular for one; only copy in `blanks.ts` | Approved |
| (b) Style: bold, `#FFFF00`, black, marker text unchanged; PDF `.tbc` with `print-color-adjust: exact` and the `-webkit-` prefix; Puppeteer header 10pt bold Times; DOCX bold + Word `yellow`; jsPDF fallback stamps the header and highlights | Approved |
| (c) "Do not file this document until each item is filled in or removed. You are responsible for what is filed." | Approved: word for word |
| (d) Marker set, underscore runs, signature line, registry-number rule (first `No. ___ of` in the cause title, not after "in" / "arising out of", title ends at a VERSUS line or paragraph 1) | Approved |
| Signing-date exception limited to a verification or jurat block (or "this" before it); an AFFIDAVIT heading alone does not exempt | Acceptable. Narrower than my 11 Oct words "verification, affidavit or jurat block", so it counts more dates, never fewer. Safe side; no change |
| Dialog labels "Blank to fill in" / "To be confirmed — add the detail", never printed | Approved |
| T-245's new blank `[To be confirmed: Section … of the CrPC or Section … of the BNSS]` is counted by the existing `[To be confirmed: …]` row | Noted: no change needed |
| Marker match is case-sensitive (`[to be confirmed: …]` in lower case would not count) | Risk, low: the Drafter writes the marker in this form. Follow-up for Priya: case-insensitive match, my sign-off not needed for that change alone |

Signed: Ajay (CLO), 12 Oct 2026 IST, for commit 0a70e0b. A later change to `blanks.ts`, the header text, the style or the dialog sentence needs a fresh sign-off.
