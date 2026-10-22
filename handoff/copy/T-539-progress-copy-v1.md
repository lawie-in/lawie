# T-539 progress copy v1: drafting progress screen

DRAFT v1, not approved. Author: Madhuri. For Meera (review), Arjun (events, Ink lines), Ajay (law-naming strings). Date 2026-10-21.
Spec: handoff/design/T-539-draft-progress-spec.md. Ink rule: handoff/tickets/T-521-intake-and-editor-night-library.md (lines 25-30). No T-539 ticket file exists; I used T-521.
Conventions: `{braces}` are variables. [HI] Hindi. [CHECK] unsure. Counts are characters.

## 0. Open items

| # | For | Item |
| --- | --- | --- |
| 1 | Rajesh, Arjun | Spec s5 says "Your Ink is not charged until the draft finishes" (30 s) and "Your Ink is not charged" (2 min). T-521 says a dropped connection can still end charged. I DROPPED both claims. Spec s6 body "Nothing is charged" is also not covered by the rule; dropped. |
| 2 | Arjun | Which cancel path is it: error event, or POST cancel? The Ink line below is used only for an error event (not insufficient_ink). |
| 3 | Meera | Hindi uses "मसौदा" (spec) and "ड्राफ़्ट" (T-511). I kept "ड्राफ़्ट" for consistency with the rest of the app. Pick one. [CHECK] |

## 1. Stage names (label, one-line description)

| stage | EN name | EN line | HI name | HI line |
| --- | --- | --- | --- | --- |
| queued | In line | Your draft is waiting its turn. | कतार में | आपके ड्राफ़्ट की बारी आने वाली है। |
| intake | Reading facts | Lawie is reading what you described. | तथ्य पढ़ना | आपका बताया हुआ विवरण पढ़ा जा रहा है। |
| preflight | Checking inputs | Lawie checks what the draft needs. | ज़रूरी बातें जाँचना | देखा जा रहा है कि ड्राफ़्ट के लिए क्या चाहिए। |
| draft | Writing | The draft is being written below. | ड्राफ़्ट लिखना | ड्राफ़्ट नीचे लिखा जा रहा है। |
| verify | Checking the draft | Lawie checks the draft against your facts. | ड्राफ़्ट जाँचना | ड्राफ़्ट को आपके तथ्यों से मिलाया जा रहा है। |
| repair | Fixing, round {n} of 2 | Items from the check are being fixed. | सुधार, चरण {n}/2 | जाँच में मिली बातें सुधारी जा रही हैं। |
| render | Laying out | The document is being laid out. | दस्तावेज़ सजाना | दस्तावेज़ का रूप तैयार हो रहा है। |
| done | Draft ready | You can read and edit it now. | ड्राफ़्ट तैयार | अब आप इसे पढ़ और बदल सकते हैं। |

Fallback for an unknown stage: `Working…` / `काम जारी है…`
Note: "against your facts" is plain description, not an accuracy claim. [CHECK]

## 2. Still working (15 s silence)

- EN: `Still working…` (14)
- HI: `काम जारी है…` (12)

## 3. Connection lost

| State | EN | HI |
| --- | --- | --- |
| Label | `Connection lost. Reconnecting…` (31) | `कनेक्शन टूट गया। फिर जुड़ रहा है…` |
| After 30 s, detail | `Still trying to reconnect.` | `अब भी जुड़ने की कोशिश जारी है।` |
| Button | `Retry now` (9) / `Try now` | `अभी फिर कोशिश कीजिए` |
| Refreshed page | `Reconnecting to the draft…` | `ड्राफ़्ट से फिर जुड़ रहा है…` |
| After 2 min, error | `Could not reach Lawie.` + hint `Check your documents list before you try again.` | `Lawie तक नहीं पहुँच सके।` + `दोबारा कोशिश से पहले अपनी दस्तावेज़ सूची देख लीजिए।` |
| Error buttons | `Try again` / `Back` | `फिर कोशिश कीजिए` / `वापस` |

Hint line follows T-521 ("Check your documents; if the draft is there..."): it points to the list and claims nothing about Ink. Arjun to confirm. Do not show the Ink line here (stream ended without an event).

## 4. Cancel dialog

| Item | EN | HI |
| --- | --- | --- |
| Link | `Cancel draft` | `ड्राफ़्ट रोकिए` |
| Title | `Stop this draft?` (16) | `यह ड्राफ़्ट रोकें?` |
| Body | `You can start again from your details.` | `आप अपने विवरण से दोबारा शुरू कर सकते हैं।` |
| Safe button | `Keep going` (10) | `जारी रखिए` |
| Confirm | `Stop draft` (10) | `ड्राफ़्ट रोकिए` |
| Working | `Stopping…` | `रोका जा रहा है…` |
| Disabled (render to done) | `Almost done, finishing the document.` | `लगभग हो गया, दस्तावेज़ तैयार हो रहा है।` |

Variants: title `Stop drafting?`; safe `Not now`; confirm `Yes, stop`.

Ink line, ONLY WHERE TRUE: error event, not insufficient_ink (Arjun, T-521):
- EN: `No Ink was used.`
- HI: `कोई Ink नहीं कटा।`

Neutral line for every other case (dropped stream, cancel, insufficient_ink, refresh), no claim about Ink:
- EN: `Check your documents list to see where this draft stands.`
- HI: `यह ड्राफ़्ट कहाँ तक पहुँचा, यह देखने के लिए अपनी दस्तावेज़ सूची देखिए।`
- For insufficient_ink: show the server's own text only, no extra line.

## 5. Documents-list chip and accessible names

| Item | EN | HI |
| --- | --- | --- |
| Chip, verify | `Verifying… 70 %` | `जाँच जारी… 70 %` |
| Chip, other | `{stage}… {pct} %` using the short names: Reading, Checking, Writing, Fixing, Laying out | `पढ़ना…`, `जाँच…`, `लिखना…`, `सुधार…`, `सजाना…` + `{pct} %` |
| Chip aria-label | `{title}, {stage}, {pct} percent` | `{title}, {stage}, {pct} प्रतिशत` |
| Progress bar name | `Draft progress` | `ड्राफ़्ट की प्रगति` |
| aria-valuetext | `{stage name}, {pct} percent` + `, {eta or detail}` if present | `{stage name}, {pct} प्रतिशत` |
| Live region (stage change) | `{stage name}` | `{stage name}` |
| Live region (lost) | `Connection lost. Reconnecting.` | `कनेक्शन टूट गया। फिर जुड़ रहा है।` |
| Show steps | `Show steps` / `Hide steps` | `चरण दिखाइए` / `चरण छिपाइए` |
| Cancel aria-label | `Cancel draft` | `ड्राफ़्ट रोकिए` |
| Retry aria-label | `Retry connecting now` | `अभी फिर जुड़ने की कोशिश कीजिए` |
| Dot labels | `{stage name}, done / current / upcoming` | `{stage name}, पूरा / अभी / आगे` |
| Shelf spine | `{title}, {stage}, {pct} percent` | `{title}, {stage}, {pct} प्रतिशत` |

ETA words (spec s4): `a few seconds` / `कुछ सेकंड`; `about {n} s` / `लगभग {n} सेकंड`; `about {n} min` / `लगभग {n} मिनट`. These are shown only when the server sends `eta_s`; I wrote no estimate of my own.

## 6. Ajay checks

- Server detail example in the spec: `checked 4 of 9 citations` (s2). It names no law, but "citations" is a legal term and T-511 avoided it. Server owns the text; Ajay to read.
- Server error `label` set (s7, "Ajay-signed set"): not seen, not rewritten.
- Hindi "तथ्यों से मिलाया जा रहा है" (section 1, verify line): confirm it is not read as a legal-accuracy claim.

## 7. Words avoided

court-ready, accurate, fast, guaranteed, safe, lost (about drafts), free, secure, any law or section name, any time estimate of mine.

Ready for next task.
