# T-612: Regular bail: chosen ground is lost, grounds buttons do nothing, draft has no grounds paragraph

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (severity P1; from the prod quality check of 26 Oct 2026) |
| Owner  | Tanvi/Kunal (web) + a drafting lead; Ajay for grounds list |
| Mode   | Full chain |
| Status | Merged into develop_staging 81ca13d2 (CI 1100), 27 Oct 2026. Priya |
| Source | handoff/quality/2026-10-26-prod-drafting-FAIL.md |

## Problem
The ground picked in round 1 shows 'To be asked' in the brief; clicking a ground on the brief does nothing (twice); 'Answer 2 questions' asks again and the pick is lost again. The draft has no grounds paragraph (para 8 is {{MISSING: Grounds for Bail}}); the user's own sentence is pasted in para 9 and repeated in paras 11-12. The grounds list has nothing for a civil dispute, money returned, sole earner or sureties. It asked the medical condition twice though its own text said leave it blank. Quality report item 1.

## Acceptance criteria
1. A picked ground survives brief, re-ask and confirm, and is argued in the draft as a grounds paragraph.
2. The grounds buttons on the brief work.
3. Ajay adds the missing grounds (civil dispute, money returned, sole earner, sureties) to the list.
4. The medical-condition question is not asked twice.

## Files
Lead lists after Explore (web brief + drafting). Claimed by Priya.

## Added by part 2 of the prod check (Anushka, item 11)
The same fault is in ANTICIPATORY bail: four grounds picked (no prior record, will cooperate, deep roots, reputation ruined by arrest) were all gone on the brief ('To be asked'); clicking a ground on the brief did nothing; the draft prints `{{MISSING: Grounds for Anticipatory Bail (select all applicable)}}` as para 6 and argues nothing (eight short paragraphs). AC 1 to 4 apply to both bail types. Both bail drafts print `{{MISSING: Grounds for ...}}` (T-611 guard also applies).

## Added 26 Oct 2026 (from Vishal's T-611 Explore)
5. Regular bail 'in custody since' (para 3, {{MISSING}} although the arrest date was in the brief) is fixed in the bail packs (_skeletons/bail_regular.json, docs/templates/bail_regular.json), which this ticket holds. Ajay's arrest-date rule (R1, asked by Vishal) applies.
