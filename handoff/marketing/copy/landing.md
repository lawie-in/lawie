# Landing page copy — lawie.in (home)

Owner: Madhuri (copy). Approver: Meera. Claims: Ajay. Build: a lead, through Priya as a ticket (copy only). Replaces the text on `apps/web/src/app/(marketing)/page.tsx`.
Status: **DRAFT.** Goes live only with v1 (T-403), after T-227 and T-238 merge and Ajay signs the table at the end.

Wording sources: Ajay, `handoff/legal/marketing-s1-claims-signed.md`; Vikram, `handoff/tickets/vikram-gtm-decisions.md`; T-222, T-227, T-238, T-141a, T-234.

Fixed lines, used verbatim:
- Disclaimer: `Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.`
- Ink: `5 free Ink on sign-up. Most documents use 2 Ink; short ones, such as most notices and affidavits, use 1. You're charged only after a draft is generated; a failed generation is not charged.`
- Sanhitas: `Criminal drafts cite BNS, BNSS and BSA.`

No rupee figures on this page (the pricing teaser links to /pricing). "Free" always sits next to "5 Ink".

---

## Meta

| Field | Copy | Chars |
| --- | --- | --- |
| Title (A, recommended) | Lawie: first drafts for Indian advocates | 40 |
| Title (B) | Lawie: a drafting assistant for Indian advocates | 48 |
| Title (C) | Lawie: start from a first draft, not a blank page | 49 |
| Description | A drafting assistant for Indian advocates. Pick a document, answer a few questions, then review, edit and download your first draft. Start with 5 free Ink. | 155 |

Replaces the current description, "Legal drafting for Indian advocates, built around the current criminal codes — BNS, BNSS, and BSA." ("built around the current criminal codes" reads as the whole-product "updated for BNS" claim Ajay ruled out).

---

## Hero

| Part | Copy | Chars |
| --- | --- | --- |
| Eyebrow | Drafting assistant for Indian advocates | 39 |
| Headline (A, recommended) | Your first draft, ready to review. | 34 |
| Headline (B) | Start from a draft, not a blank page. | 37 |
| Headline (C) | Bail applications, notices, affidavits: start from a first draft. | 65 |
| Subline | A drafting assistant for Indian advocates. Pick a document, answer a few questions about the matter, then review, edit and download the draft in Word or PDF. | 157 |
| Primary CTA | Start with 5 free Ink | 21 |
| Secondary CTA | See what you can draft | 22 |
| Note under CTAs | 5 free Ink on sign-up · Sign in with Google | 43 |

- Eyebrow replaces "AI legal drafting · built for India" (no AI hype).
- If headline B is chosen, the subline stays the same.
- Primary CTA links to `/login?mode=signup`. Secondary CTA anchors to `#documents`.
- Primary CTA variants: A "Start with 5 free Ink" (21) · B "Start your first draft" (22) · C "Try Lawie with 5 free Ink" (25).
- The current note "Free tier: 5 Ink (lifetime) · No credit card required" is dropped. "No credit card required" is not on Ajay's list of signed claims. If Priya confirms sign-up never asks for a card, it can come back after Ajay's check.
- Hero visual: the current mock shows "Your district, your court" ("your court" is banned) and "S.480 BNSS". It is Rajesh's to replace; I am flagging the text only.

---

## How it works

Section heading: **Three steps to a first draft.** (28)

| Step | Title | Body | Chars (body) |
| --- | --- | --- | --- |
| 1 | Pick a document | Bail application, legal notice, affidavit, agreement: more than 90 to choose from. | 81 |
| 2 | Answer a few questions | Tell Lawie about the matter: parties, dates and the facts the document needs. | 77 |
| 3 | Review, edit, download | Read the draft, change anything in the editor, then download it in Word or PDF. | 79 |

Replaces "Say what you need / Describe the matter in your own words." (describe-first is behind a flag, not live) and "Give the case details / FIR number, sections, parties."

---

## What you can draft (anchor `#documents`)

Heading: **More than 90 document types.** (28)
Subline: **Criminal drafts cite BNS, BNSS and BSA.** (39)

| Family | Line |
| --- | --- |
| Bail applications | Regular, anticipatory, before magistrate, interim, default, cancellation |
| Legal notices | Including s.80 CPC and s.138 NI Act notices |
| Affidavits | Affidavits in support, counter and rejoinder affidavits, and more |
| Petitions and plaints | Writ petitions, plaints, criminal appeals and revisions, and more |
| Family-court matters | Including mutual-consent divorce and maintenance |
| Agreements | Rent, NDA, MOU, service, loan, employment, and more |
| Court applications | Condonation of delay, restoration, amendment of pleadings, and more |
| Deeds and instruments | Vakalatnama, will, GPA, SPA, and more |

Closing line: **Find yours in the document list after you sign in.** (51)

Optional sample PDFs (the live page has four): keep the "Sample PDF" links only with the label **"Sample, fictional matter"** next to each. Ajay to look at the four PDFs once more against his "cite" ruling and the disclaimer. Priya to confirm they are still served.

---

## You stay the advocate

Heading: **You stay the advocate.** (23)

Body:

```
Lawie gives you a structured first draft. You read it, check every section and every fact, and change whatever needs changing. Then you download it in Word or PDF and file it the way you always have.

Every draft carries this line:
Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.
```

Three short points (icons by Rajesh):
- **Edit everything.** Every line of the draft is yours to change. (44)
- **Word or PDF.** Download and keep working in the format you use. (48)
- **No legal advice.** Lawie helps with drafting. It does not advise or file. (55)

Heading variants: A "You stay the advocate." (23) · B "Lawie drafts. You decide." (25) · C "The draft is yours to check." (28)

---

## Pricing teaser (no rupee figures)

Heading: **Start with 5 free Ink.** (22)

Body (Ajay's Ink line, verbatim):

```
5 free Ink on sign-up. Most documents use 2 Ink; short ones, such as most notices and affidavits, use 1. You're charged only after a draft is generated; a failed generation is not charged.
```

Line under it: **Need more? Monthly plans and top-up packs are on the pricing page.** (64)
Link: **See pricing** → `/pricing` (11)

Replaces the three plan cards on the home page (they repeat rupee figures and "5 Ink, lifetime" / "Ink a month" that belong on /pricing) and the subline "Drafts are paid for with Ink credits."

---

## Sign-in note (under the final CTA, and on the login link in the nav if it has a tooltip)

**Sign in with Google. Email and password: coming soon.** (53)

When T-234 ships to production: **Sign in with Google, or with your email and password.** (54). The swap is Meera's call (strategy §9.5).

---

## FAQ (home page)

Heading: **Questions advocates ask.** (24)

1. **What is Lawie?**
   Lawie is a drafting assistant for Indian advocates. You pick a document, answer a few questions about the matter, and get a first draft to review, edit and download in Word or PDF.

2. **What can I draft?**
   More than 90 document types, including bail applications, legal notices, affidavits, petitions, family-court matters and agreements. Criminal drafts cite BNS, BNSS and BSA.

3. **Who is responsible for the draft?**
   You are. Every draft carries the line: "Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing." Lawie does not give legal advice and does not file anything. Check every section and every fact before you file.

4. **What is Ink?**
   Ink is Lawie's credit unit. 5 free Ink on sign-up. Most documents use 2 Ink; short ones, such as most notices and affidavits, use 1. You're charged only after a draft is generated; a failed generation is not charged.

5. **Am I charged if a draft fails?**
   No. You're charged only after a draft is generated; a failed generation is not charged.

6. **Can I edit the draft before I download it?**
   Yes. The draft opens in an editor where you can change any text. Then download it in Word or PDF.

7. **Can I draft in Hindi?**
   Drafts are in English today. Hindi drafting: coming soon.

8. **Can I sign up with email and password?**
   Sign in with Google today. Email and password: coming soon.

Removed from the current home FAQ:
- "Are the BNS section mappings accurate?" ("accurate"; the answer claims mappings "built directly from the official correspondence tables", which goes beyond Ajay's "cite" line and touches the old-law switch).
- "Does Lawie cover my specific court?" (court coverage; T-140 not started).
- "Is my case data secure?" (not on Ajay's signed list. It can stay if Ajay signs it separately. I didn't rewrite it).

---

## Final CTA

| Part | Copy | Chars |
| --- | --- | --- |
| Heading (A, recommended) | Your next draft starts here. | 28 |
| Heading (B) | Start from a draft, not a blank page. | 37 |
| Heading (C) | Pick a document. Review the draft. | 34 |
| Line | 5 free Ink on sign-up. Sign in with Google. | 43 |
| Button | Start with 5 free Ink | 21 |

Replaces "Start drafting in the next five minutes." (time claim, banned) and "Free for your first 5 Ink. No card required."

---

## Footer disclaimer

**Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.** (89)

Replaces "AI-assisted drafting tool — not a substitute for legal advice." in `components/marketing/SiteFooter.tsx`. Also, in the footer, "Start Drafting" → **"Start with 5 free Ink"** (21), since "Start Drafting" sits next to nothing about Ink.

---

## Hindi version (hero + how it works)

For a Hindi landing variant or the bar-demo one-pager. Devanagari, everyday Hindi, legal terms in English.

**Hero**

| Part | Copy |
| --- | --- |
| Eyebrow | भारतीय advocates के लिए drafting assistant |
| Headline (A, recommended) | पहला ड्राफ्ट तैयार, आप बस जाँचें। |
| Headline (B) | खाली पन्ने से नहीं, ड्राफ्ट से शुरुआत। |
| Headline (C) | Bail application, notice, affidavit: पहला ड्राफ्ट यहाँ से। |
| Subline | डॉक्यूमेंट चुनिए, मामले के कुछ सवालों के जवाब दीजिए, फिर ड्राफ्ट जाँचिए, बदलिए और Word या PDF में डाउनलोड कीजिए। |
| Primary CTA | 5 free Ink से शुरू करें |
| Secondary CTA | देखें क्या-क्या ड्राफ्ट कर सकते हैं |
| Note | साइन-अप पर 5 free Ink · Google से sign in |

**How it works**

Heading: **पहला ड्राफ्ट, तीन स्टेप में।**

| Step | Title | Body |
| --- | --- | --- |
| 1 | डॉक्यूमेंट चुनिए | Bail application, legal notice, affidavit, agreement: 90 से ज़्यादा में से। |
| 2 | कुछ सवालों के जवाब दीजिए | मामले के बारे में बताइए: पक्षकार, तारीख़ें और वे तथ्य जो इस डॉक्यूमेंट में चाहिए। |
| 3 | जाँचिए, बदलिए, डाउनलोड कीजिए | ड्राफ्ट पढ़िए, editor में जो चाहें बदलिए, फिर Word या PDF में डाउनलोड कीजिए। |

Disclaimer under the Hindi section stays in English, verbatim: `Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.` (Ajay's exact wording. A Hindi rendering would need his sign-off.)

Note: a Hindi page must not imply Hindi drafts. Drafts are in English; if this variant ships, add under the subline: **"ड्राफ्ट अंग्रेज़ी में बनते हैं। Hindi drafting: coming soon."**

---

## Claims to check (Ajay)

| # | Claim | Where | Basis |
| --- | --- | --- | --- |
| 1 | Lawie is a drafting assistant for Indian advocates | Meta, hero, FAQ 1 | Signed (Ajay, 12 Oct) |
| 2 | Flow: pick a document, answer a few questions, review, edit, download (Word or PDF) | Meta, hero, how it works, FAQ 1, FAQ 6 | Signed; T-222 steps |
| 3 | More than 90 document types | How it works, documents, FAQ 2 | Signed; 92 rule files |
| 4 | Families and examples in the document table (bail x6, s.80 and s.138 notices, affidavits, writ petitions, plaints, criminal appeals and revisions, mutual-consent divorce, maintenance, rent/NDA/MOU/service/loan/employment, condonation, restoration, amendment, vakalatnama, will, GPA, SPA) | Documents | Rule-file names in `apps/drafting/src/config/document-rules/`. New detail beyond the signed list: please check |
| 5 | "Criminal drafts cite BNS, BNSS and BSA." | Documents, FAQ 2 | Signed, exact |
| 6 | Ink line | Pricing teaser, FAQ 4 | Signed, exact |
| 7 | Not charged for a failed generation | FAQ 5 | Signed (part of Ink line) |
| 8 | Disclaimer on every draft; advocate responsible | You stay the advocate, FAQ 3, footer | T-197, signed |
| 9 | Every line is editable in the editor | How it works, You stay the advocate, FAQ 6 | Live flow. Priya to confirm "every line" |
| 10 | Lawie does not give legal advice and does not file | You stay the advocate, FAQ 3 | Denial only. Confirm it is acceptable with "legal advice" on the banned list |
| 11 | Sign in with Google; email and password coming soon | Hero note, sign-in note, FAQ 8 | Signed (coming soon until T-234 ships) |
| 12 | Drafts in English; Hindi drafting coming soon | FAQ 7, Hindi variant | Signed |
| 13 | Intake asks about parties, dates and the facts the document needs | How it works step 2 | Priya to confirm against the form |
| 14 | Monthly plans and top-up packs exist | Pricing teaser | Vikram: Solo and top-ups final |
| 15 | Headline "Your first draft, ready to review." | Hero A | "ready" refers to review, not filing. Ajay ruled "ready" out of the Ink line; confirm it is fine here |
| 16 | Sample PDFs, labelled "Sample, fictional matter" | Documents (optional) | Ajay to re-check the four PDFs |
