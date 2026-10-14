# Parked list

Should-fixes and nice-to-haves that are not tickets (Arjun's rule, 14 Oct 2026; see README "Follow-ups and the parked list"). One line each: date, source, what. Priya and Arjun review it weekly; most items die here.

| Date | Source | What |
| ---- | ------ | ---- |
| 14 Oct 2026 | T-411 review (Tanvi) | DynamicFormRenderer: a failed courts/states fetch is swallowed silently (no Retry alert, unlike CourtPicker); pre-existing, all templates. |
| 14 Oct 2026 | T-425 (Tanvi) | Six bail template ids and the court-type labels are duplicated between web and server; move them to @lawie/shared later (needs the shared claim). |
| 14 Oct 2026 | T-407 part 2 (Vishal) | Template seed copies related_acts raw into Template.relatedActs in Mongo, so the s.138 twin stores the literal "{ni_act_related_sections}". Nothing reads it today; a future UI showing relatedActs would print the placeholder. |
| 14 Oct 2026 | T-115b (Kunal) | review.routes.ts admin assign/list (~95/137/193) skips the isDeleted filter, so an admin could mint a review token for a document mid-erase. (Public GET/POST review paths fixed in T-115b; admin paths stay parked.) |
| 14 Oct 2026 | T-115b (Kunal) | Erase sweep has no alert for a document stuck pending; more than 50 stuck would starve newer erases. |
| 14 Oct 2026 | T-425 part 2 (Tanvi) | Classic form: a kept (not-offered) court can show the saved court's state name when the draft's state differs. DFR has no draft loading yet. |
| 14 Oct 2026 | T-425 part 2 (Tanvi) | Possibly one extra court lookup on a state/type change; no wrong value. |
| 14 Oct 2026 | T-436 (Ajay) | Optional customer GSTIN on invoices (B2B input credit). Ajay, parked. |
| 14 Oct 2026 | T-436 (Ajay) | Class 3 DSC on invoice PDFs instead of a scanned signature. Ajay, parked. |
| 14 Oct 2026 | T-115c (Ajay) | Privacy §9 server-log retention has no period. Arjun to give one, Ajay signs the line. |
| 14 Oct 2026 | Arjun (post-v1) | SES bounce/complaint webhook to an app suppression list (SCRUM-77 §7; code has only the EMAIL_CONFIGURATION_SET hook, no handler). For v1 the SES account-level suppression list covers it. |
| 14 Oct 2026 | T-115b (Kunal) | POST /review/:token/feedback can race the erase within one Mongo round trip; claim the token atomically (findOneAndUpdate isUsed:false to true), which also closes the existing double-submit. |
| 14 Oct 2026 | Ajay ef06e89 | Privacy §3/§5: the Atlas row may say 'India (Mumbai)' (Arjun confirmed). Ships with the next privacy-page change: Tanvi's T-115c. |
| 14 Oct 2026 | T-429 (Ajay 83fbd62) | criminal_revision Para 7: say the S.438(3) BNSS bar is on a further revision 'by the same person'. |
| 14 Oct 2026 | T-115c (Ajay 41616be) | Billing/ledger rows have no TTL. Add a sweep that deletes them after 72 months (Privacy §9, DPDP s.8(7)). Tax retention is the billing rows, not AuditLog (Arjun). |
| 14 Oct 2026 | T-433 (Shashank) | Terms §6 still says 'short ones use 1'; T-238 signed 'short documents' wherever the Ink line appears. Needs Ajay's word; ships with the next terms-page change. |
| 14 Oct 2026 | T-429 (Vishal) | template-promoter readComputedFields shallow-copies value_map, which is shared with the cached rule JSON; deep-copy it. |
| 14 Oct 2026 | T-384 (Meera/Rajesh) | Let the advocate choose 'Not known' on a date row from the brief itself; T-384 covers only a date already answered 'Not known'. |
| 14 Oct 2026 | T-384 (Meera/Rajesh) | The 'Change' link on a 'Not known' date needs an accessible name with the row label, e.g. 'Change {row label}'. Low priority. |
