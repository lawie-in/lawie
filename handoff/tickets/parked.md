# Parked list

Should-fixes and nice-to-haves that are not tickets (Arjun's rule, 14 Oct 2026; see README "Follow-ups and the parked list"). One line each: date, source, what. Priya and Arjun review it weekly; most items die here.

| Date | Source | What |
| ---- | ------ | ---- |
| 14 Oct 2026 | T-411 review (Tanvi) | DynamicFormRenderer: a failed courts/states fetch is swallowed silently (no Retry alert, unlike CourtPicker); pre-existing, all templates. |
| 14 Oct 2026 | T-425 (Tanvi) | Six bail template ids and the court-type labels are duplicated between web and server; move them to @lawie/shared later (needs the shared claim). |
| 14 Oct 2026 | T-407 part 2 (Vishal) | Template seed copies related_acts raw into Template.relatedActs in Mongo, so the s.138 twin stores the literal "{ni_act_related_sections}". Nothing reads it today; a future UI showing relatedActs would print the placeholder. |
| 14 Oct 2026 | T-115b (Kunal) | review.routes.ts admin assign/list (~95/137/193) skips the isDeleted filter, so an admin could mint a review token for a document mid-erase. |
| 14 Oct 2026 | T-115b (Kunal) | Erase sweep has no alert for a document stuck pending; more than 50 stuck would starve newer erases. |
