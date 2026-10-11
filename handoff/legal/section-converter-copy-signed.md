# Section converter page: claims to remove now (signed)

Ajay (CLO), 12 Oct 2026 IST. Raised by shashank (T-250): the public page says the tool "covers 500+ section mappings validated by a practising advocate" and the metadata says "500+ validated mappings". Neither is true today: the IEA to BSA and CrPC to BNSS tables were rebuilt on 12 Oct after 117 and 103 wrong rows were found, and the IPC to BNS table (T-267) has not been checked row by row. No practising advocate has validated the mappings. A "validated by a practising advocate" claim that is not true is a misleading claim (Consumer Protection Act, 2019; BCI Rules, Part VI, Chapter II, r.36 is also engaged by a claim about advocates' validation). It goes now; it is a copy-only change (add to T-252).

## `apps/web/src/app/tools/section-converter/page.tsx` (line ~130)

Replace

`This tool covers 500+ section mappings validated by a practising advocate. For professional drafting with auto-conversion, try Lawie's AI document generator.`

with

`This tool maps section numbers between the old and new criminal laws. Check the bare act before you rely on a mapping: a section number alone does not tell you which law applies to your case. For a first draft to review, try Lawie's drafting assistant.`

(the link keeps its `href="/login"`; its text becomes `Lawie's drafting assistant`). "Auto-conversion" goes: Lawie never converts a section from one code to the other by itself (T-245).

## `apps/web/src/app/tools/section-converter/layout.tsx` (line 6, description)

Replace

`Free IPC to BNS, CrPC to BNSS, IEA to BSA section converter. Instantly look up old and new Indian criminal law section numbers. 500+ validated mappings.`

with

`Free IPC to BNS, CrPC to BNSS, IEA to BSA section converter. Look up old and new Indian criminal law section numbers. Check the bare act before you rely on a mapping.`

("Instantly" is a speed claim; "500+ validated mappings" goes.)

## When a validation claim may return

Only after T-267 is signed and the three tables are on production, and only in this form: `Mappings checked against the Gazette text of the Acts.` It never says "validated by a practising advocate" until a practising advocate has actually checked them and the founder names who.

Signed: Ajay (CLO), 12 Oct 2026 IST.
