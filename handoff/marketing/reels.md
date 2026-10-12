# Reel scripts — R1, R2, R3, R4 (Instagram Reels + YouTube Shorts)

Owner: Madhuri (copy). Approver: Meera. Claims: Ajay (`handoff/legal/marketing-package-signed.md`, section E). Visuals and edit: Rajesh (plus the freelance editor in Vikram's budget).
Status: **DRAFT, held until go-live.** Same launch gate as the calendars (`strategy.md` §0).

Format: 9:16, 30–45 s, captions burned in. Voice-over in Hindi, with English subtitles. On-screen text in English.

## Which reel feeds which slot

| Reel | Title | Flow shown | Calendar slot |
| --- | --- | --- | --- |
| R1 | Draft a bail application with me | Describe-first (new flow) | **HOLD.** W1-IG-2 (Week 1, Day 3) only if describe-first is live for all users at go-live |
| R2 | Legal notice in Lawie | Describe-first (new flow) | **HOLD.** W2-IG-2 (Week 2, Day 12) only if describe-first is live for all users |
| R3 | You stay the advocate | Starts from a finished draft; names no intake step | Week 3 reel (calendar not yet written). Works with either flow |
| R4 | Draft a bail application with me (classic path) | Browse document types, pick a template, fill the form | **Fallback, no HOLD.** W1-IG-2 if describe-first is not live at go-live; W2-IG-2 again (instead of R2) if it is still not live in Week 2 |

**Swap rule:** Week 1 reel = R4 if describe-first is not live for all users at go-live, otherwise R1. Week 2 reel = R2 if describe-first is live, otherwise R4 again. The same rule is at the top of both calendars. YouTube Shorts gets the same cut.

Why the HOLD: describe-first is behind feature flags today (on only for the founder; the founder decides go-live). A reel must show what a user can do on the day it is published.

## Gates (Ajay, section A; apply to every reel)

- **No criminal-draft screenshot, reel or sample PDF before T-245a/b are merged.** Until then the packs cite BNS for old-law cases. R1, R3 (it reuses the R1 draft) and R4 all show a criminal draft, so all three wait for T-245a/b.
- **Default bail is not named in any reel** until T-251 is merged (the current pack has a live legal error).
- **Every Ink line waits for T-227.** No rupee figure in any reel.
- No "secure", "safe" or "encrypted" claim. Nothing about highlighted blanks until T-194 is live and Ajay gives a line.

## Production rules (all four reels)

1. **Record on a laptop/desktop browser, then crop and zoom into 9:16.** Do not show a phone screen, a phone frame or a mobile layout. "Works on mobile" is banned (T-141a; phone support is T-138, not done).
2. **Fictional matters only**, labelled on screen for the whole time case details are visible: `Sample, fictional matter`. No real names, FIR numbers, police stations, courts or client facts. Use obviously sample values (below).
3. **Offence date after 1 July 2024** in every criminal sample. Per Ajay, Lawie's packs do not handle old-law (pre-1 July 2024) matters, and no reel may suggest they do.
4. **No time claims.** No on-screen timer or clock, no "in X seconds/minutes", no sped-up footage labelled as real time. Cut the generation wait with a plain cut.
5. **Show the real product as it is on production (after T-403).** R1 and R2 show describe-first, so they are published only when it is on for everyone. For all reels: no FIR upload, no "AI reads your FIR" claim, no highlighted blanks in exports, no "cost shown before you generate", no Hindi drafts.
6. **End card** on every reel carries the disclaimer verbatim: `Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.`
7. **CTA** on every end card: `Start with 5 free Ink` + `lawie.in`. The caption carries the UTM link via the bio (see the calendar post). No rupees in reels.
8. **Wording:** "Criminal drafts use BNS, BNSS and BSA section numbers." (Ajay, exact). "Free" only next to "5 Ink". Do not say "asks only for what is missing" (banned, T-141a); say "asks for the details it still needs".
9. **Real screen headings** (from `apps/web/src/components/intake`): `What do you need to draft?` (the describe screen; its text reads "Describe the matter in your own words"), `A few questions about what you need`, `Check your brief`, then the draft. The classic gallery heading is `Browse document types`. Do not invent other headings.
10. **What Lawie asks (Priya, from the code, 12 Oct).** After the description, Lawie asks only for the required facts it could not find in it. It is not a fixed form, and the questions differ by matter. The only facts a reel may name:
    - **Bail (describe flow):** FIR number and date, police station, sections, custody (and since when), state, court type and name, applicant name, father's or husband's name, age, address, language, brief facts, grounds (at least 2).
    - **s.138 notice:** payee and drawer with addresses, drawer type, advocate name/chamber/enrolment no., cheque no./date/amount, bank/branch, presentation date, dishonour date and reason, underlying liability.
    - **Rent agreement (not scripted yet):** state, place/date, landlord and tenant names/addresses/PAN, property address/area/type, rent and due date, payment mode, escalation, deposit, duration, notice period, permitted use, maintenance, extra terms.
    Say "asks for the details it still needs", never "asks only for what is missing" (banned, T-141a). Use sample values for every one shown.

---

## R1 — "Draft a bail application with me" (describe flow, ~44 s)

> **HOLD: publish only once describe_first is on for all users.** Also waits for T-245a/b (criminal draft).

**Pillars:** P2 Everyday court work, P3 You stay the advocate. **Calendar:** W1-IG-2 if describe is live at go-live (else R4).
**Hook (0–2 s):** on-screen "Draft a bail application with me" over the describe screen "What do you need to draft?".

**Sample values (all fictional, on screen):** Accused: `A. Kumar (sample)` · FIR No. `000/2026` · Police station: `Sample Nagar` · Offence date: `02/09/2026` · Court: `[Sample Sessions Court]`. The label `Sample, fictional matter` stays pinned top-left from 0:03 to 0:28.

**Sample description typed on screen** (fictional, in the user's own words): `Regular bail for A. Kumar (sample). FIR 000/2026, Sample Nagar police station, offence on 02/09/2026. In custody. Sessions court.`

| Time | On-screen visual | On-screen text (EN) | Voice-over (HI) | Subtitle (EN) |
| --- | --- | --- | --- | --- |
| 0:00–0:02 | The describe screen, heading `What do you need to draft?` | Draft a bail application with me | चलिए, साथ में एक bail application ड्राफ्ट करते हैं। | Let's draft a bail application together. |
| 0:02–0:09 | The sample description is typed into the box | Step 1: describe the matter in your own words | पहले अपने शब्दों में मामला लिखिए। यहाँ सब fictional है। | First, describe the matter in your own words. All fictional here. |
| 0:09–0:15 | Screen `A few questions about what you need`: two or three questions, answered with sample values (for example custody, court, grounds) | Step 2: a few questions | जो details अभी चाहिए, Lawie वही पूछता है। जवाब दीजिए। | Lawie asks for the details it still needs. Answer them. |
| 0:15–0:19 | Screen `Check your brief`: the brief with the sample values | Step 3: check your brief | फिर अपना brief जाँच लीजिए। | Then check your brief. |
| 0:19–0:21 | Click "Generate", plain cut (no wait shown) | (none) | (none) | (none) |
| 0:21–0:28 | The draft opens. Zoom on the heading `[Sample Sessions Court]` and the cited **Section 483 BNSS** (and the prayer) | Criminal drafts use BNS, BNSS and BSA section numbers. | पहला ड्राफ्ट आ गया। Criminal drafts में BNS, BNSS और BSA cite होते हैं। | The first draft is here. Criminal drafts use BNS, BNSS and BSA section numbers. |
| 0:28–0:35 | Editor: the advocate rewrites one ground in their own words | Review and edit | अब असली काम: हर line पढ़िए, हर section जाँचिए, grounds अपने शब्दों में लिखिए। | Now the real work: read every line, check every section, put the grounds in your own words. |
| 0:35–0:38 | Download menu, "Word" chosen; the file appears | Download: Word or PDF | फिर Word या PDF में डाउनलोड कीजिए। | Then download it in Word or PDF. |
| 0:38–0:44 | End card: Lawie logo, CTA, disclaimer | Start with 5 free Ink · lawie.in / Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing. | ड्राफ्ट Lawie देता है, फ़ैसला आपका। 5 free Ink से शुरू कीजिए। | Lawie gives you the draft; the call is yours. Start with 5 free Ink. |

**Frame rule (Ajay, 12 Oct):** with the court shown as `[Sample Sessions Court]`, the heading and prayer must show **Section 483 BNSS**. Section 480 is only for a bail application before a Magistrate. **Ajay to check the actual frame at 0:21–0:28 before publishing.**

**Caption (EN):**

```
Draft a bail application with me.

Describe the matter in your own words, answer a few questions about the details Lawie still needs, check your brief, then review, edit and download the draft. Criminal drafts use BNS, BNSS and BSA section numbers.

Sample, fictional matter. No real case or client is shown.

Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.

Start with 5 free Ink. Link in bio.
```

**Caption (HI):**

```
चलिए, साथ में एक bail application ड्राफ्ट करते हैं।

अपने शब्दों में मामला लिखिए, Lawie जो details पूछे उनके जवाब दीजिए, अपना brief जाँचिए, फिर ड्राफ्ट देखिए, बदलिए और डाउनलोड कीजिए। Criminal drafts में BNS, BNSS और BSA cite होते हैं।

Sample, fictional matter. कोई असली केस या क्लाइंट नहीं दिखाया गया है।

Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.

5 free Ink से शुरू करें। Link bio में है।
```

**CTA:** "Start with 5 free Ink" (end card) · caption "Link in bio". Variants: A "Start with 5 free Ink" (21) · B "Your first draft: 5 free Ink" (28) · C "Try it on your next bail matter" (31)

**Disclaimer on end card:** `Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.`

**Claims to check (Ajay):**
1. "Regular bail" can be described and drafted through the describe flow (`bail_regular`).
2. Screen headings (`What do you need to draft?`, `A few questions about what you need`, `Check your brief`) match the real screens; the questions named in the voice-over come from the bail list in production rule 10 (Priya, 12 Oct).
3. "Criminal drafts use BNS, BNSS and BSA section numbers."
4. **Section 483 BNSS** visible in the draft, with `[Sample Sessions Court]`. **Ajay to check the actual frame.**
5. Everything in the draft can be changed in the editor; download in Word or PDF.
6. Sample matter fictional, labelled, offence date after 1 July 2024.
7. Gate: T-245a/b merged before this reel is published.

---

## R2 — "Legal notice in Lawie" (describe flow, ~40 s)

> **HOLD: publish only once describe_first is on for all users.** Also waits for T-227 (Ink line).

**Pillars:** P2 Everyday court work, P4 Pay per draft (a 1-Ink document). **Calendar:** W2-IG-2 if describe is live (else R4).
**Hook (0–2 s):** on-screen "A legal notice. 1 Ink." over the describe screen.

**Sample values (all fictional):** Sender: `B. Sharma (sample)` · Recipient: `C. Traders (sample)` · Cheque No. `000000` · Amount: `₹00,000 (sample)` · Bank: `Sample Bank`. Dates in 2026. Label `Sample, fictional matter` pinned top-left from 0:03 to 0:30. (Zeros so no real-looking rupee figure appears.)

**Sample description typed on screen** (fictional): `Notice to C. Traders (sample) for a dishonoured cheque, No. 000000, drawn on Sample Bank, from B. Sharma (sample).`

| Time | On-screen visual | On-screen text (EN) | Voice-over (HI) | Subtitle (EN) |
| --- | --- | --- | --- | --- |
| 0:00–0:02 | Describe screen, heading `What do you need to draft?` | A legal notice. 1 Ink. | Legal notice भेजना है? | Need to send a legal notice? |
| 0:02–0:09 | The sample description is typed into the box | Describe the matter in your own words | अपने शब्दों में मामला लिखिए। सब fictional है। | Describe the matter in your own words. All fictional. |
| 0:09–0:14 | Screen `A few questions about what you need`: one or two questions answered with sample values | A few questions | जो details अभी चाहिए, Lawie पूछता है। | Lawie asks for the details it still needs. |
| 0:14–0:17 | Screen `Check your brief` | Check your brief | अपना brief जाँचिए। | Check your brief. |
| 0:17–0:19 | Click "Generate", plain cut | (none) | (none) | (none) |
| 0:19–0:25 | The notice opens. Zoom on the demand paragraph: payment **within fifteen days of receipt of this notice**. The Ink pill in the top bar (count, tier, Top-up button) drops by 1 | Most notices use 1 Ink. Charged only after a draft is generated. | ज़्यादातर notice में 1 Ink लगता है, और Ink ड्राफ्ट generate होने के बाद ही कटता है। | Most notices use 1 Ink, and you're charged only after a draft is generated. |
| 0:25–0:32 | Editor: the advocate edits the demand paragraph | Review. Edit anything. | पढ़िए, जाँचिए, जो बदलना हो बदलिए। | Read it, check it, change what you need to. |
| 0:32–0:35 | Download as PDF | Download: Word or PDF | Word या PDF में डाउनलोड। | Download in Word or PDF. |
| 0:35–0:40 | End card | Start with 5 free Ink · lawie.in / Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing. | 5 free Ink से शुरू कीजिए। | Start with 5 free Ink. |

**Frame rule (Ajay, 12 Oct):** the demand paragraph must call for payment **within fifteen days of receipt of the notice**, as NI Act s.138 proviso (c) requires. **Ajay to check the actual frame at 0:19–0:25 before publishing.** This is a notice. "Cheque bounce complaint" stays banned.

**Caption (EN):**

```
A legal notice in Lawie.

Describe the matter in your own words, answer a few questions, check your brief, then review, edit and download the notice. Most notices use 1 Ink, and you start with 5 free Ink.

Sample, fictional matter. No real case or client is shown.

Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.

Start with 5 free Ink. Link in bio.
```

**Caption (HI):**

```
Lawie में legal notice.

अपने शब्दों में मामला लिखिए, कुछ सवालों के जवाब दीजिए, अपना brief जाँचिए, फिर notice देखिए, बदलिए और डाउनलोड कीजिए। ज़्यादातर notice में 1 Ink लगता है, और शुरुआत 5 free Ink से।

Sample, fictional matter. कोई असली केस या क्लाइंट नहीं दिखाया गया है।

Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.

5 free Ink से शुरू करें। Link bio में है।
```

**CTA:** "Start with 5 free Ink". Variants: A "Start with 5 free Ink" (21) · B "Draft your next notice" (22) · C "Most notices: 1 Ink" (19)

**Disclaimer on end card:** `Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.`

**Claims to check (Ajay):**
1. The s.138 NI Act notice is live (`legal_notice_s138`) and is a 1-Ink document (T-227).
2. "Most notices use 1 Ink. Charged only after a draft is generated." (signed wording, shortened; approved after T-227).
3. The Ink pill sits in the top bar on every dashboard page, including the draft screen (count, tier, Top-up button), so the overlay stays (Priya, 12 Oct).
4. Screen headings match the real screens; the questions named in the voice-over come from the s.138 list in production rule 10 (Priya, 12 Oct).
5. **Demand paragraph shows payment within fifteen days of receipt of the notice. Ajay to check the actual frame.**
6. Sample matter fictional and labelled. If a less loaded example is wanted, use `legal_notice_breach_of_contract` with the same beats.

---

## R3 — "You stay the advocate" (~35 s) — Week 3

**Pillar:** P3 You stay the advocate. **Calendar:** Week 3 reel (week 3 calendar not yet written).
**Flow check (round 2):** R3 starts on a finished draft and names no intake step, so it matches either flow and needs no HOLD for describe-first. It reuses the R1 / R4 sample draft, so it waits for T-245a/b like them.
**Hook (0–2 s):** on-screen "Lawie drafts. You decide." over a draft in the editor, with the disclaimer line visible.

Uses the R1 or R4 sample draft (fictional, offence date after 1 July 2024), so no new matter is needed.

| Time | On-screen visual | On-screen text (EN) | Voice-over (HI) | Subtitle (EN) |
| --- | --- | --- | --- | --- |
| 0:00–0:02 | Draft in the editor, disclaimer line visible | Lawie drafts. You decide. | ड्राफ्ट Lawie का, फ़ैसला आपका। | Lawie drafts. You decide. |
| 0:02–0:08 | Zoom on the disclaimer banner above the editor (below the "starting draft" label) | Every draft says this. | हर ड्राफ्ट पर यह लाइन रहती है। | Every draft carries this line. |
| 0:08–0:16 | Advocate's cursor goes paragraph by paragraph; a section reference is highlighted by the cursor (not by the app) | Read every line. Check every section. | हर line पढ़िए। हर section जाँचिए। | Read every line. Check every section. |
| 0:16–0:24 | Advocate rewrites a sentence and adds a fact | Edit anything. | जो बदलना हो, बदलिए। तथ्य आपके, शब्द आपके। | Change whatever you need. Your facts, your words. |
| 0:24–0:29 | Download menu: Word and PDF | Download in Word or PDF | फिर Word या PDF में डाउनलोड करके अपने तरीक़े से काम कीजिए। | Then download in Word or PDF and work the way you always do. |
| 0:29–0:35 | End card | Start with 5 free Ink · lawie.in / Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing. | Lawie ड्राफ्टिंग में मदद करता है। ज़िम्मेदारी advocate की रहती है। 5 free Ink से शुरू कीजिए। | Lawie helps with the drafting. The advocate stays responsible. Start with 5 free Ink. |

**CTA:** "Start with 5 free Ink". Variants: A "Start with 5 free Ink" (21) · B "Review your first draft" (23) · C "Your draft, your call" (21)

**Disclaimer on end card:** `Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.`

**Claims to check (Ajay):** (approved in section E)
1. The disclaimer line appears on every draft, on screen, verbatim (T-197), in a non-dismissible banner above the editor, below the "starting draft" label (Priya, 12 Oct). The 0:02 shot films that banner.
2. Everything in the draft can be changed in the editor.
3. Download in Word or PDF.
4. The cursor highlight at 0:08 is the advocate's, not a product feature. No "highlighted blanks" implication (T-194 not merged).
5. Sample matter fictional and labelled.

---

## R4 — "Draft a bail application with me" (classic path, FALLBACK, ~42 s)

No HOLD tag: this is the path every user has today. It waits only for T-245a/b (criminal draft) and the general launch gate.

**Pillars:** P2 Everyday court work, P3 You stay the advocate. **Calendar:** W1-IG-2 if describe-first is not live at go-live; W2-IG-2 again if it is still not live in Week 2.
**Hook (0–2 s):** on-screen "Draft a bail application with me" over the `Browse document types` screen.

**Sample values and label:** same as R1. `Sample, fictional matter` pinned top-left from 0:06 to 0:30.

**Note for Priya:** in the working tree I read (12 Oct), a card on `Browse document types` opens the describe screen, so "pick a template, fill the form" may not exist once the flag is on. R4 is only valid while the classic path is what a user gets. Priya to confirm the classic screens on the recording day. If the form has different fields, change the voice-over to what is on screen. Do not invent fields: the only facts this reel may name are FIR number and date, police station, sections, custody, court, applicant details, facts, grounds.

| Time | On-screen visual | On-screen text (EN) | Voice-over (HI) | Subtitle (EN) |
| --- | --- | --- | --- | --- |
| 0:00–0:02 | `Browse document types`, bail group visible | Draft a bail application with me | चलिए, साथ में एक bail application ड्राफ्ट करते हैं। | Let's draft a bail application together. |
| 0:02–0:06 | Cursor picks the regular bail template | Step 1: pick the document | Document list से regular bail चुनी। | I pick regular bail from the list. |
| 0:06–0:16 | The form is filled with the sample values; label visible | Step 2: fill in the matter | अब मामले की details भरते हैं: नाम, FIR, police station, तारीख़। यहाँ सब fictional है। | Now the details of the matter: name, FIR, police station, date. All fictional here. |
| 0:16–0:18 | Click "Generate", plain cut | (none) | (none) | (none) |
| 0:18–0:25 | The draft opens. Zoom on the heading `[Sample Sessions Court]` and the cited **Section 483 BNSS** | Criminal drafts use BNS, BNSS and BSA section numbers. | पहला ड्राफ्ट आ गया। Criminal drafts में BNS, BNSS और BSA cite होते हैं। | The first draft is here. Criminal drafts use BNS, BNSS and BSA section numbers. |
| 0:25–0:33 | Editor: the advocate rewrites one ground in their own words | Step 3: review and edit | अब असली काम: हर line पढ़िए, हर section जाँचिए, grounds अपने शब्दों में लिखिए। | Now the real work: read every line, check every section, put the grounds in your own words. |
| 0:33–0:37 | Download menu, "Word" chosen | Download: Word or PDF | फिर Word या PDF में डाउनलोड कीजिए। | Then download it in Word or PDF. |
| 0:37–0:42 | End card | Start with 5 free Ink · lawie.in / Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing. | ड्राफ्ट Lawie देता है, फ़ैसला आपका। 5 free Ink से शुरू कीजिए। | Lawie gives you the draft; the call is yours. Start with 5 free Ink. |

**Frame rule (Ajay):** same as R1. `[Sample Sessions Court]` means **Section 483 BNSS** in the heading and prayer. **Ajay to check the actual frame at 0:18–0:25 before publishing.**

**Caption:** the classic-flow captions already in the calendar for W1-IG-2 (EN and HI) fit R4 as written.

**CTA:** "Start with 5 free Ink". Variants: A "Start with 5 free Ink" · B "Try the bail draft yourself: 5 free Ink" (39) · C "Your first draft: 5 free Ink to start" (37)

**Disclaimer on end card:** `Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.`

**Claims to check (Ajay):**
1. "Regular bail" is a live document in the bail group, picked from `Browse document types` (`bail_regular`).
2. The form fields named in the voice-over come from the bail list in production rule 10 (Priya, 12 Oct); on the recording day Priya confirms the classic form shows the same fields.
3. "Criminal drafts use BNS, BNSS and BSA section numbers."
4. **Section 483 BNSS** in the draft with `[Sample Sessions Court]`. **Ajay to check the actual frame.**
5. Everything in the draft can be changed in the editor; download in Word or PDF.
6. Sample matter fictional, labelled, offence date after 1 July 2024.
7. Gate: T-245a/b merged before this reel is published.
