# T-689b: Real document type in the page header, documents list and KPIs

Status: READY (kunal, feature/t-689b-doc-type-label-everywhere @ 7b6d4091, 30 Oct 2026). Was: backlog (small, after T-689 merges). Raised 29 Oct 2026 by Kunal.

## Acceptance criteria

1. The document page header (~l.529 of web dashboard/documents/[id]/page.tsx), the documents list "Type" column and the dashboard KPI typeLabel all show the same pack-derived label as T-689's docTypeLabel. A written statement reads "Written Statement" everywhere, never "petition".
2. The stored docType enum is unchanged.
3. Packs without a file (writ_petition, criminal_complaint, plaint_civil) keep the current fallback.

## Notes for Ajay (no action unless he wants it)

- 6 pack names keep a bracketed law (e.g. "Plaint for Ejectment (TPA S.106/111)").
- 4 legal-notice labels run past 60 characters.
