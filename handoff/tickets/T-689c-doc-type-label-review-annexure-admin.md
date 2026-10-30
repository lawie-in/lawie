# T-689c: Doc type label on the review page, the annexure and admin

Status: ASSIGNED kunal 30 Oct 2026 (P1, full chain, legal). Was: backlog. Raised 30 Oct 2026 by Priya from Kunal's T-689b follow-ups.

1. The shared review page (apps/web review/[token]/page.tsx:218) still says "petition" for a written statement. Add docTypeLabel to the review payload and show it.
2. annexures.service.ts:478 prints "Nature of matter: PETITION" in a generated annexure. This is document output and may be legal content: Ajay rules (AJ-689c) what it should print before anyone changes it.
3. The admin documents page shows the raw docType. Show the label instead (low).
4. Optional cleanups: GET /documents/:id uses the shared label helper; remove the duplicated GUIDED_ID; add a negative cache for pack-less ids.

## Acceptance criteria
- A written statement reads "Written Statement" on the shared review page and on the admin page.
- The annexure line matches Ajay's ruling, byte for byte.
- Tests for each.

## Ajay AJ-689c (53da5707), 30 Oct 2026
- "Nature of matter" prints the pack's signed display name, byte for byte from the catalogue (e.g. "Written Statement"), never the template id. If it is missing, print "[To be confirmed: Nature of matter]".
- Annexure B is a High Court-practice synopsis whose fixed text says "the petitioner has approached…". Attach it only for High Court or Supreme Court documents filed by the petitioner or applicant. Never attach it to trial-court documents or to defence pleadings (written statement, replication, reply).
- The tests are in Ajay's ruling row. Legal content: Ajay byte-checks the final SHA before merge.
- Priority: P1 (a wrong synopsis in a filed document). Item 2 above is the main work.

## Ajay AJ-689c-a (91bdb434), 30 Oct 2026. Supersedes the "Nature of matter" wording above.
1. Nature of matter prints the raw catalogue displayName, byte for byte (e.g. "Written Statement (Order VIII CPC)").
2. No Annexure B for: written_statement, replication, counter_affidavit, rejoinder_affidavit, memo_of_parties, list_of_dates, synopsis, vakalatnama, affidavit_identity, affidavit_in_support, production_of_documents. A pack with no side row gets B only if rule 3 holds.
3. B only for high_court, high_court_bench and supreme_court. Unknown or missing court: no B.
4. Renumber with no gap, and build the index annexure from the same list so the letters always match.

## Ajay AJ-689c-b (2e9c765d), 30 Oct 2026
1. "No gap" also covers the advocate-annexed index rows and the serial numbers.
2. A respondent-side client blocks Annexure B (the side row names the respondent or opposite party). With no side info, the deny list and the court list decide.
3. Golden snapshots: the High Court cases get a pack id and court type and keep their Synopsis. Only the trial-court snapshots change, hand-edited per golden-snapshots.md. Ajay sees the full diff; only "B removed" or "letters closing up" changes are allowed.

## Ajay AJ-689c-d (3c571e12), 30 Oct 2026
1. Court type for Annexure B: doc.courtType, then the form's court_type, then the chosen court's own type from the court lookup.
2. Nature of matter: the displayName, else the rule file's signed title byte for byte, else "[To be confirmed: Nature of matter]".
3. Guided briefs (pack id `guided`) never get Annexure B.
4. An accused filer is the applicant, so B follows the court rule. If the complainant or State files, B is blocked when the side is known.
