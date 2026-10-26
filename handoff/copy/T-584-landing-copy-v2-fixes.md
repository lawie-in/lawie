# T-584 landing copy v2: fixes from Kunal's build review

| Field | Value |
| --- | --- |
| Author | Madhuri (content) |
| For | Meera (approval), Ajay (claim = yes rows), Kunal and Rajesh (build) |
| Source | Kunal's findings (a) to (e). Base files read at origin/develop_staging: `handoff/copy/T-584-landing-copy-v2.md` (2a8baca), `handoff/copy/T-584-landing-copy-v2-addendum.md`, `handoff/legal/T-584-landing-copy-rulings-ajay.md`, `handoff/design/T-584-landing-reading-desk-spec.md` |
| Status | DRAFT. Not approved by Meera. Claim = yes rows not signed. Proposes; changes no signed line. |
| Date | 2026-10-26 |

Conventions as in v2: lengths are Unicode characters, spaces included, placeholders counted as typed. `{n}`, `{count}`, `{name}` are filled by the web from the catalogue JSON; no count is typed anywhere. Hindi uses the -इए register.

Authority note: Ajay's "document types" change for M-LP-15-06 and 15-08 is in his rulings file; the copy file on origin still reads "drafts" in those two rows (and in the variants #2 and #3 of 15-06). The build takes Ajay's rulings text. Section (c) below makes 15-07 and 15-12 match it. Variants #2 and #3 of 15-06 are retired (they use "drafts"); replacements are in (c) if Meera wants alternates.

## (a) M-LP-08a: no number, and a rule for how many samples show

Problem: "Three drafts" and the spec's three-folio grid are untrue while two samples ship (the s.138 notice and the maintenance petition). The regular-bail sample joins later.

Rule (for Kunal): a sample folio renders only when its PDF is present in the samples data, the same "no file, no folio" rule as the video. The h2 never carries a number. The section renders when at least 2 folios have a PDF; with 0 or 1 it does not render (the h2 and M-LP-08b are plural: "Drafts", "They show"). Layout follows the count (2 columns for 2, 3 for 3); that part is Rajesh's call. M-LP-09a (bail) stays in the file, unused until its PDF exists. Nothing else in the copy changes when the third sample is added.

| id | where it appears | EN | HI | claim to sign | length (EN / HI; limit 56) |
| --- | --- | --- | --- | --- | --- |
| M-LP-08a | Samples h2 (replaces "Three drafts left on the desk for you to read.") | Drafts left on the desk for you to read. | ड्राफ़्ट मेज़ पर रखे हैं, आपके पढ़ने के लिए। | no | 40 / 44 |

Variants (headline):

| # | EN | len | HI |
| --- | --- | --- | --- |
| 08a #1 (primary) | Drafts left on the desk for you to read. | 40 | ड्राफ़्ट मेज़ पर रखे हैं, आपके पढ़ने के लिए। |
| 08a #2 | Drafts on the desk, for you to read. | 36 | मेज़ पर रखे ड्राफ़्ट, आपके पढ़ने के लिए। |
| 08a #3 | Read a sample draft. | 20 | एक नमूना ड्राफ़्ट पढ़िए। |

Note: #3 is singular, so use it only if the section is allowed to render with one folio (then M-LP-08b "They show" must also become singular, which I would write on request). Primary is the recommendation.

## (b) M-LP-10c and the caption chip M-LP-15-10

Problem: "Loads on play" is false (muted in-view loop, `preload="none"` is an implementation detail and not something to promise). There is also no Hindi caption track yet, so "Captions in English and Hindi" is false today.

Proposal: do not hide 10c. "Real product, fictional parties" is the disclosure Ajay's condition on 10c relies on, so it must stay beside the video. Drop the load sentence for good. Pick the caption sentence by the caption tracks that exist in the video data, not by a flag in code: English only now; English and Hindi once the Hindi track ships. No change to the Ink or any other copy.

| id | where it appears | EN | HI | claim to sign | length (EN / HI; limit 90) |
| --- | --- | --- | --- | --- | --- |
| M-LP-10c (replaces v2 text) | Video note, English track only (today) | Real product, fictional parties. Captions in English. | असली प्रोडक्ट, काल्पनिक पक्षकार। अंग्रेज़ी कैप्शन। | yes | 53 / 50 |
| M-LP-10c-hi | Video note, once the Hindi track ships (same as v2 minus "Loads on play.") | Real product, fictional parties. Captions in English and Hindi. | असली प्रोडक्ट, काल्पनिक पक्षकार। हिंदी और अंग्रेज़ी कैप्शन। | yes | 63 / 59 |
| M-LP-15-10a | Caption chip, English track only (today) | CC English | CC English | no | 10 / 10 |
| M-LP-15-10 | Caption chip, both tracks (unchanged, signed on Ajay's condition) | CC English · हिंदी | CC English · हिंदी | yes (signed, unchanged) | 18 / 18 |

Notes:

- This is exactly Ajay's fallback ("drop `हिंदी` from the chip and from M-LP-10c"), made data-driven so the second row switches on by itself when the track exists. The video section still does not render without the real footage (his condition on 10c).
- If Meera wants even less on the page, a third option is `Real product, fictional parties.` alone (32 / 32). I do not recommend it: the page would not say the video is captioned, and the loop is silent.
- With only an English track, the Hindi toggle shows the Hindi sentence "अंग्रेज़ी कैप्शन।", which is accurate.

## (c) M-LP-15-07, 15-07b, 15-12: match Ajay's "document types"

Yes, they should match. The drawer count and the aria text describe the same thing as 15-06 and 15-08, and the spec's label-in-name rule means the aria text must start with the visible text. Hindi changes form at n = 1 (प्रकार के → प्रकार का), so the singular row is needed in Hindi as well as in English. The spec's open-panel header `{name} · {n} drafts` should use the same count string (15-07 / 15-07b), not a typed one.

| id | where it appears | EN | HI | claim to sign | length (EN / HI) |
| --- | --- | --- | --- | --- | --- |
| M-LP-15-07 | Drawer count line, visible, and the panel header count | {n} document types | {n} प्रकार के दस्तावेज़ | yes (follows Ajay's 15-06 and 15-08 ruling; same word) | 18 / 23 |
| M-LP-15-07b | Same, when n = 1 | 1 document type | 1 प्रकार का दस्तावेज़ | yes (same) | 15 / 21 |
| M-LP-15-12 | Drawer button aria-label (begins with the visible text; state from `aria-expanded`) | {name}, {n} document types | {name}, {n} प्रकार के दस्तावेज़ | no | 26 / 31 |
| M-LP-15-12b | Same, when n = 1 | {name}, 1 document type | {name}, 1 प्रकार का दस्तावेज़ | no | 23 / 29 |

Alternates for the 15-06 headline (to replace retired variants #2 and #3; the primary is Ajay's signed line, not touched):

| # | EN | len | HI |
| --- | --- | --- | --- |
| 15-06 #2 | {count} document types, shelf by shelf | 38 | {count} प्रकार के दस्तावेज़, दराज़ दर दराज़ |
| 15-06 #3 | The library holds {count} document types to start from. | 55 | लाइब्रेरी में शुरू करने के लिए {count} प्रकार के दस्तावेज़। |

Notes:

- 15-07 and 15-07b I mark claim = yes only because they say what the library holds; Ajay can confirm in one line that they are covered by his 15-06 reasoning (drafts would suggest ready-made documents). If he rules they are labels, they drop to Meera's list.
- If the web cannot switch on n = 1, tell me and I will write a number-free form (`Document types: {n}` does not help; a plain `Templates` label would, since 15-13 already says `Templates in {name}`).
- Not changed: M-LP-07 (signed, "first draft" there describes the output, not the library), M-LP-15-13, 15-14.

## (d) Hero folio: court heading and cause title (the rows Ajay's ruling (a) points to)

Ajay's T-601 ruling (a): court heading, cause title and grounds 1 to 3 "signed as in the v2 rows"; the grounds exist as M-LP-15-01 to 03 (15-01 as he changed it), but the heading and cause title were never written. Below, fictional only. Conditions applied from his ruling: parties are `Sample Person 1` and the State; no case number, FIR number or section appears anywhere in the folio; a real court name would be allowed under the watermark, but I use a generic court and a placeholder district so no real court is implied. The folio writes top to bottom: 15-16, 15-20, 15-17, 15-18, 15-19, then grounds 15-01 to 03. No "Bail Application No." line.

| id | where it appears | EN | HI | claim to sign | length (EN / HI) |
| --- | --- | --- | --- | --- | --- |
| M-LP-15-16 | Hero folio, court heading (static text in `nl-copy.ts`; set in capitals by CSS) | In the Court of the Sessions Judge, Sample District | सत्र न्यायाधीश के न्यायालय में, नमूना ज़िला | yes | 51 / 43 |
| M-LP-15-20 | Hero folio, document title under the heading | Application for regular bail | नियमित जमानत के लिए आवेदन | yes | 28 / 25 |
| M-LP-15-17 | Hero folio, cause title, first party | Sample Person 1 … Applicant | नमूना व्यक्ति 1 … आवेदक | yes | 27 / 23 |
| M-LP-15-18 | Hero folio, cause title, between the parties | Versus | बनाम | yes | 6 / 4 |
| M-LP-15-19 | Hero folio, cause title, second party | The State … Opposite Party | राज्य … विपक्षी | yes | 26 / 15 |

Notes for Ajay:

- "Sample District" is a placeholder so the heading cannot point to a real court. If you prefer a real district name (your ruling allows it under the watermark), say which and I will swap it; Hindi `नमूना ज़िला` then becomes the Hindi name of that district.
- 15-20 names the document type only. No section (no BNSS number), no case number, no outcome, nothing a reader could take as a promise.
- "Opposite Party" is the usual cause-title label for the State in a bail application; if you want "Respondent", change 15-19 EN and HI (`प्रतिवादी`) in one place.
- The visible parties match M-LP-09a (`Sample Person 1` and the State), so the hero folio and the sample list agree.

## (e) M-LP-14-T: template titles under the Hindi toggle

Confirmed rule, no new row: template display titles (drawer panel lists and sample folio titles) stay English under the Hindi toggle until M-LP-14-T exists. M-LP-14-T stays "not written": the Hindi titles come after Arjun's catalogue file (T-600) exists, then go to Ajay for terminology. Everything around the titles (drawer count 15-07, panel label 15-13, sample eyebrows 15-15a to c, meta line 15-11) stays Hindi as already written. If the build also keeps drawer names English under the toggle (the spec says the section stays English until T-600 fixes the shown list, ruling 9), that is a build choice; the signed Hindi names M-LP-14-01 to 24 remain ready and unused.

## Sign-off list for these fixes

- Ajay (claim = yes): M-LP-10c (English-only line), M-LP-10c-hi, M-LP-15-07, M-LP-15-07b, M-LP-15-16, 15-17, 15-18, 15-19, 15-20. M-LP-15-10 is already signed on his condition.
- Meera (claim = no): M-LP-08a, M-LP-15-10a, M-LP-15-12, M-LP-15-12b.
- Kunal and Rajesh: the section rule in (a) (at least two folios, else no section; folio only when its PDF exists) and the data-driven caption lines in (b).
- Priya: confirm Hindi captions timeline (b) and that the s.138 notice and maintenance petition PDFs are the two that ship.
