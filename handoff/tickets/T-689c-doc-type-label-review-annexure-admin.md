# T-689c: Doc type label on the review page, the annexure and admin

Status: backlog. Raised 30 Oct 2026 by Priya from Kunal's T-689b follow-ups.

1. The shared review page (apps/web review/[token]/page.tsx:218) still says "petition" for a written statement. Add docTypeLabel to the review payload and show it.
2. annexures.service.ts:478 prints "Nature of matter: PETITION" in a generated annexure. This is document output and may be legal content: Ajay rules (AJ-689c) what it should print before anyone changes it.
3. The admin documents page shows the raw docType. Show the label instead (low).
4. Optional cleanups: GET /documents/:id uses the shared label helper; remove the duplicated GUIDED_ID; add a negative cache for pack-less ids.

## Acceptance criteria
- A written statement reads "Written Statement" on the shared review page and on the admin page.
- The annexure line matches Ajay's ruling, byte for byte.
- Tests for each.
