# T-511 copy v1: Night Library UI and landing page

| Field | Value |
| --- | --- |
| Author | Madhuri (content) |
| For | Priya (T-511), Meera (review), Ajay (claims sign-off) |
| Spec | handoff/design/T-511-night-library-spec.md |
| Pricing rules | handoff/tickets/T-398-pricing-pro-plan-card.md (Ajay, 15 Oct 2026) |
| Status | DRAFT v1. Not approved. Not for build until Meera approves and Ajay signs. |
| Date | 2026-10-17 |

Conventions: `{braces}` are variables filled by code. `[HI]` means a Hindi (Devanagari) version follows. `[CHECK]` means I am unsure Ajay will pass it. Character counts (Unicode characters, spaces included) are given for landing page headlines, buttons and SEO strings. Prices include GST. Spelling: BNS, BNSS, BSA only where legal content is named (none used in this copy).

## 0. Decisions needed before this can ship

| # | For | Decision |
| --- | --- | --- |
| 1 | Ajay, Meera | Spec says the main button is "Start a free draft". T-398 says "free" appears only with "5 Ink". I used "Start with 5 free Ink" everywhere. Confirm, or approve "Start a free draft". |
| 2 | Done | Pro removed from the landing prices block (1.6); "See all plans" link added. Pro stays in the in-app plan chooser (4.1), which T-398 does not cover. [CHECK] |
| 3 | Done | No "coming" line anywhere (Meera, v1 review). Footer has the disclaimer and links only. |
| 4 | Ajay | Privacy and vendor lines (sections 1.6, 1.7, 6) say what is sent to whom. Vendor names and countries in the examples are my assumption (Anthropic, USA; Razorpay, India). Ajay owns the vendor list. [CHECK] |
| 5 | Ajay | "Your drafts are safe" (500 page) and "Your documents are still here" (AI down) are safety statements. Alternatives are given. [CHECK] |
| 6 | Priya | Switching plans: spec says cancel at cycle end, then buy. My text tells the user that plainly (section 4.4). Confirm this is the real flow. |
| 7 | Priya | Default court field: I say it fills the court name in new drafts. Confirm that is what the product does. |
| 8 | Priya | I removed the old FAQ line "Most documents use 2 Ink, short documents 1" (brief says no draft counts). The cost is shown before generating. Confirm the app shows it. |
| 10 | Ajay | Sign-up "account exists" message replaced by a neutral line (2.4). [AJAY TO RULE] |
| 11 | Ajay | "Keep Ink cost before generate" and "failed generation is not charged" claims are tagged [AJAY TO SIGN, T-388 AC4] wherever they appear. |
| 9 | Ajay | Hindi wording for the disclaimer and trust block needs a legal read, not only a language read. |

---

## 1. Landing page

### 1.1 SEO

- SEO title: `Lawie: drafting assistant for advocates in India` (48 chars)
- SEO title, variant: `Lawie | Legal drafting assistant for advocates` (46 chars)
- Meta description: `Describe your matter and get a first draft of a bail application, notice, writ or maintenance petition to review and edit. Start with 5 free Ink.` (145 chars)
- Meta description, variant: `Lawie helps advocates write first drafts of bail applications, notices, writs and more. You review and edit every line. Start with 5 free Ink.` (142 chars)

### 1.2 Top bar

- Nav links: How it works, Documents, Prices, FAQ
- Language toggle: `English` / `हिन्दी`
- Sign-in link: `Sign in`
- Primary button: see 1.3

### 1.3 Hero

Headline (pick one). Display size, so keep it short.

- A EN: `Describe the matter. Lawie writes the first draft.` (50 chars)
- A HI: `मामला बताइए। पहला ड्राफ़्ट Lawie लिखेगा।` (40 chars)
- B EN: `Start from a draft, not a blank page.` (37 chars)
- B HI: `खाली पन्ने से नहीं, एक ड्राफ़्ट से शुरू कीजिए।` (46 chars)
- C EN: `Draft with Lawie. Review every line.` (36 chars)
- C HI: `Lawie से ड्राफ़्ट बनाइए। हर पंक्ति खुद जाँचिए।` (46 chars)

My pick: A (says what happens, makes no claim).

Sub-line:

- EN: `Lawie is a drafting assistant for advocates. Tell it about your matter in plain words, get a first draft of a bail application, notice, writ or maintenance petition, then read it, edit it and decide.` (199 chars)
- HI: `Lawie अधिवक्ताओं के लिए एक ड्राफ़्टिंग सहायक है। अपना मामला सरल शब्दों में बताइए, जमानत आवेदन, नोटिस, रिट या भरण-पोषण याचिका का पहला ड्राफ़्ट पाइए, फिर उसे पढ़िए, बदलिए और खुद तय कीजिए।` (185 chars)

Primary button (pick one):

- 1 EN: `Start with 5 free Ink` (21 chars)
- 1 HI: `5 मुफ़्त Ink के साथ शुरू कीजिए` (30 chars)
- 2 EN: `Create your account` (19 chars)
- 2 HI: `अपना खाता बनाइए` (15 chars)
- 3 EN: `Start drafting` (14 chars)
- 3 HI: `ड्राफ़्ट बनाना शुरू कीजिए` (25 chars)

Small lines under the button (sign-up asks for no card: the sign-up offer modal in apps/web says "No card needed to sign up" and the home page says "No card required"):

- EN: `No card needed.`
- HI: `कार्ड की ज़रूरत नहीं।`

- EN: `Verify your email to receive your 5 Ink.` (40 chars)
- HI: `5 Ink पाने के लिए अपना ईमेल सत्यापित कीजिए।` (43 chars)

Secondary link:

- EN: `See how it works` (16 chars)
- HI: `यह कैसे काम करता है` (19 chars)

Demo folio (right side, scripted). Caption: `Example only. Not a real matter.` / HI: `केवल उदाहरण। यह कोई वास्तविक मामला नहीं है।` Replay button: `Replay` / `फिर से चलाइए`.

Demo prompt text (typed in the demo):

- EN: `A bail application for a client arrested on Tuesday. First offence. Lives with family in the district.`
- HI: `मंगलवार को गिरफ़्तार मुवक्किल के लिए जमानत आवेदन। पहला मामला है। परिवार के साथ ज़िले में रहता है।`

The draft the demo writes must be dummy text with placeholders (`{Court}`, `{Case no.}`, `{Name}`), no section numbers, no case names. [CHECK] Ajay to see the final demo text before launch.

### 1.4 Three steps

Section title: `How it works` / HI `यह कैसे काम करता है`

| Step | Title | Body |
| --- | --- | --- |
| 1 EN | `Describe` | `Tell Lawie about the matter in your own words. If something is missing, it asks a few short questions.` |
| 1 HI | `बताइए` | `अपने शब्दों में मामला बताइए। कुछ कम हो तो Lawie कुछ छोटे सवाल पूछता है।` |
| 2 EN | `Draft` | `Lawie writes a first draft of the document you chose. You see the Ink cost before it starts.` [AJAY TO SIGN, T-388 AC4] |
| 2 HI | `ड्राफ़्ट` | `आपके चुने हुए दस्तावेज़ का पहला ड्राफ़्ट Lawie लिखता है। शुरू होने से पहले आपको Ink की लागत दिख जाती है।` |
| 3 EN | `Review` | `Read every paragraph and edit what you need. A checks panel lists items for you to review. Finalise when you are satisfied.` |
| 3 HI | `जाँचिए` | `हर अनुच्छेद पढ़िए और जो बदलना हो बदलिए। जाँच पैनल उन बातों की सूची देता है जिन्हें आपको देखना है। संतुष्ट हों तभी अंतिम कीजिए।` |

CTA after the steps: same button as 1.3 (repeat).

### 1.5 Document types

- Section title EN: `Documents you can draft`
- Section title HI: `जो दस्तावेज़ आप बना सकते हैं`
- Line EN: `Bail applications, legal notices, writ petitions, maintenance petitions, plaints, written statements, affidavits and more.` (131 chars)
- Line HI: `जमानत आवेदन, कानूनी नोटिस, रिट याचिका, भरण-पोषण याचिका, वाद-पत्र, लिखित कथन, शपथ-पत्र और भी बहुत कुछ।` (107 chars)
- Shelf labels (spines): Bail application, Legal notice, Written statement, Plaint, Affidavit
- Shelf labels HI: जमानत आवेदन, कानूनी नोटिस, लिखित कथन, वाद-पत्र, शपथ-पत्र

Checked against apps/drafting/src/config/document-rules: rule files exist for bail, legal notice, writ petition, maintenance (BNSS 144), plaint, written statement and affidavit, so those stay. "Reply" has no template (only a non-template price), so it is dropped. [CHECK] I read the rule files, not the live picker. Priya to confirm all are enabled in the picker.

### 1.6 Ink and prices

Section title EN: `Ink and prices` / HI: `Ink और कीमतें`

Intro EN: `Ink is what a draft costs. You see the cost before you generate. A failed generation is not charged.` [AJAY TO SIGN, T-388 AC4] (100 chars)

Intro HI: `Ink वह इकाई है जिसमें ड्राफ़्ट की लागत गिनी जाती है। ड्राफ़्ट बनाने से पहले लागत दिखती है। जो ड्राफ़्ट पूरा नहीं बनता, उसका Ink नहीं कटता।` [AJAY TO SIGN, T-388 AC4] (138 chars)

Plan cards:

**Free**

- Price line: `₹0`
- Ink line: `5 Ink on sign-up, once your email is verified (lifetime)`
- Includes: `Every document type on Lawie` [CHECK: only if Free is not gated by type]; `Every line of the draft is yours to change`; `PDF / DOCX export` [CHECK: confirm export is live on Free]
- Button: `Start with 5 free Ink`

**Solo**

- Price line: `₹799 a month`
- Ink line: `50 Ink a month`
- Includes: `50 Ink a month`; `Everything in Free`; `Ink refills every month`
- Button: `Sign up to choose Solo`

Link under the cards: `See all plans` / HI `सभी प्लान देखिए` (goes to /pricing). Pro is not shown on the landing page.

Notes under the cards:

- EN: `Prices include GST. Plan Ink does not carry over to the next month.`
- HI: `कीमतों में GST शामिल है। प्लान का बचा हुआ Ink अगले महीने में नहीं जुड़ता।`

Top-up line:

- EN: `Need more? Top-up packs: ₹65 for 3 Ink, ₹199 for 10 Ink, ₹499 for 28 Ink. Top-up Ink never expires.`
- HI: `और चाहिए? टॉप-अप पैक: 3 Ink ₹65 में, 10 Ink ₹199 में, 28 Ink ₹499 में। टॉप-अप Ink कभी समाप्त नहीं होता।`

Hindi plan strings (for the Hindi toggle):

- `₹799 प्रति माह` / `50 Ink प्रति माह`
- Free ink line: `साइन-अप पर 5 Ink, ईमेल सत्यापित होने के बाद (जीवनभर के लिए)`

No yearly text anywhere. No toggle. No "save 2 months".

CTA after prices: same button as 1.3 (repeat).

### 1.7 Trust block

Section title EN: `You stay in charge` / HI: `ज़िम्मेदारी आपकी रहती है`

Paragraph 1, advocate responsibility:

- Heading EN: `The advocate is responsible`
- Heading HI: `अधिवक्ता ज़िम्मेदार है`
- EN: `Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing. Every draft is yours to read, change or discard.`
- HI: `Lawie एक ड्राफ़्टिंग सहायक है। कानूनी सटीकता और फ़ाइलिंग की ज़िम्मेदारी अधिवक्ता की है। हर ड्राफ़्ट को पढ़ना, बदलना या हटाना आपके हाथ में है।`

Paragraph 2, checks panel:

- Heading EN: `A checks panel for your review`
- Heading HI: `आपकी जाँच के लिए एक पैनल`
- EN: `After a draft is written, a panel lists items for you to review. Each item takes you to its paragraph. The panel helps you look. It does not replace your reading.`
- HI: `ड्राफ़्ट बनने के बाद एक पैनल उन बातों की सूची देता है जिन्हें आपको देखना है। हर बात आपको उसके अनुच्छेद तक ले जाती है। पैनल देखने में मदद करता है। आपके पढ़ने की जगह नहीं लेता।`

[CHECK] Ajay: confirm "lists items for you to review" matches what the panel does.

Paragraph 3, privacy:

- Heading EN: `Your privacy`
- Heading HI: `आपकी निजता`
- EN: `To write a draft, what you describe is sent to an AI service. Read the Privacy Policy to see what we collect, why, and who receives it. For a complaint or a request about your data, write to our Grievance Officer at {grievance email}.`
- HI: `ड्राफ़्ट लिखने के लिए आपका बताया हुआ विवरण एक AI सेवा को भेजा जाता है। हम क्या एकत्र करते हैं, क्यों, और किसे भेजते हैं, यह जानने के लिए गोपनीयता नीति पढ़िए। शिकायत या अपने डेटा से जुड़े अनुरोध के लिए शिकायत अधिकारी को {grievance email} पर लिखिए।`
- Link: `Privacy Policy` / `गोपनीयता नीति`

[CHECK] The whole paragraph. Grievance email and response time come from Ajay. I make no claim of "secure", "encrypted" or "never shared".

### 1.8 FAQ (6 questions, accordion, one open)

**Q1 EN: `What is Ink?`**

A: `Ink is Lawie's credit unit. You see the Ink cost before you generate a draft [AJAY TO SIGN, T-388 AC4], and you are charged only after the draft is generated. A failed generation is not charged [AJAY TO SIGN, T-388 AC4]. The Free plan gives you 5 Ink on sign-up, once your email is verified (lifetime). Paid plans give you fresh Ink every month. Plan Ink left unused at the end of the month does not carry over. Top-up packs can be bought anytime, and top-up Ink never expires.`

[CHECK] Based on the signed pricing FAQ; I removed "Most documents use 2 Ink; short documents, such as most notices and affidavits, use 1" (decision 8).

**Q2 EN: `Who is responsible for the draft?`**

A: `You are. Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing. Read the whole draft, edit it as you see fit, and use the checks panel as a prompt for your own review.`

**Q3 EN: `What if a draft fails to generate?`**

A: `A failed generation is not charged [AJAY TO SIGN, T-388 AC4]. You will see a message and can try again. Your description stays where you typed it.` [CHECK: confirm "description stays" is true in the build]

**Q4 EN: `Which documents can I draft?`**

A: `Bail applications, legal notices, writ petitions, maintenance petitions, plaints, written statements, affidavits.`

**Q5 EN: `What happens to what I type?`**

A: `To write a draft, your description is sent to an AI service. The Privacy Policy lists what we collect, why, and who receives it. You can ask to access, correct or erase your data from Settings, or write to our Grievance Officer.` [CHECK: Settings actions listed in spec screen 07; Ajay to confirm they are live.]

**Q6 EN: `Can I cancel anytime?`**

A: `Yes. Cancel from your account settings. Cancelling stops future charges and takes effect at the end of your current billing period. Ink you already have stays until then. Subscriptions are billed in advance and are not refunded; see the Refund Policy.`

(Q6 follows the signed pricing FAQ. The "stays until then" line comes from the brief.)

FAQ Hindi: not requested. English only in v1. If the Hindi toggle swaps "every string" (spec), I will translate after Ajay signs the English.

### 1.9 Final call to action

- Heading EN: `Start with a matter you already know.` (37 chars)
- Heading HI: `ऐसे मामले से शुरू कीजिए जिसे आप पहले से जानते हैं।` (50 chars)
- Heading variant EN: `Try one draft. Judge it yourself.` (33 chars)
- Heading variant HI: `एक ड्राफ़्ट आज़माइए। फ़ैसला खुद कीजिए।` (38 chars)
- Body EN: `Create an account, verify your email and use your 5 Ink on a real document.`
- Body HI: `खाता बनाइए, ईमेल सत्यापित कीजिए और अपने 5 Ink किसी असली दस्तावेज़ पर आज़माइए।`
- Button: same as 1.3 (EN and HI)

### 1.10 Footer

- Disclaimer EN (exact, Ajay): `Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.` (89 chars)
- Disclaimer HI: `Lawie एक ड्राफ़्टिंग सहायक है। कानूनी सटीकता और फ़ाइलिंग की ज़िम्मेदारी अधिवक्ता की है।` (87 chars)
- Links: Privacy, Terms, Refunds, Grievance Officer
- Links HI: गोपनीयता, शर्तें, रिफ़ंड, शिकायत अधिकारी

---

## 2. Sign-up and login

### 2.1 Tabs and headings

| Item | Copy |
| --- | --- |
| Tab 1 | `Create account` |
| Tab 2 | `Sign in` |
| Heading, create | `Create your account` |
| Subline, create | `Verify your email to receive your 5 Ink.` |
| Heading, sign in | `Welcome back` |
| Subline, sign in | `Sign in to your shelf.` |

### 2.2 Field labels and help

| Field | Label | Help or placeholder |
| --- | --- | --- |
| Name | `Full name` | `As you want it on your documents` |
| Email | `Email` | `you@example.com` |
| Password | `Password` | Help: `At least 8 characters` [CHECK: use the real rule] |
| Show or hide | `Show` / `Hide` | aria-label: `Show password` / `Hide password` |
| Consent | `I have read the Privacy Policy (version {version}, {date}) and the Terms.` | Both are links. [CHECK] Ajay: wording and version stamp. |
| Link | `Forgot password?` | |
| Button, create | `Create account` | |
| Button, sign in | `Sign in` | |
| Button, loading | `Please wait` | |

### 2.3 Verify-email screen

- Heading EN: `Check your email`
- Body EN: `We sent a link to {email}. Open it to verify your account. Your 5 Ink are added once you verify.`
- Button: `Resend email` (after sending: `Email sent. Check your inbox and spam folder.`)
- Link: `Wrong address? Change email`
- Heading HI: `अपना ईमेल देखिए`
- Body HI: `हमने {email} पर एक लिंक भेजा है। खाता सत्यापित करने के लिए उसे खोलिए। सत्यापन के बाद आपके 5 Ink जुड़ जाएँगे।`
- Button HI: `ईमेल दोबारा भेजिए`

### 2.4 Error messages

| Case | Copy |
| --- | --- |
| Wrong password | `That email and password do not match. Try again, or reset your password.` |
| Email not verified | `Verify your email to sign in. We can send the link again.` + button `Resend email` |
| Network | `Could not reach Lawie. Check your connection and try again.` + button `Retry` |
| Server error banner | `Could not sign you in. Try again.` + `Retry` |
| Email already used (sign-up) | `Check your email to continue, or sign in if you already have an account.` Same message whether or not an account exists. [AJAY TO RULE] |
| Weak password | `Use at least 8 characters.` [CHECK: real rule] |
| Email format | `Enter a valid email address.` |
| Consent not ticked | `Please accept the Privacy Policy and Terms to continue.` |
| Resend too soon | `Please wait a minute before asking for another email.` [CHECK: real limit] |

---

## 3. Dashboard

### 3.1 Greeting and date

- Greeting: `Hello, {name}` / HI: `नमस्ते, {name}`
- Page title: `Your shelf` / HI: `आपकी अलमारी`
- Date line: `{weekday}, {date}`

### 3.2 First-time empty state [HI]

- Heading EN: `The shelf is empty`
- Body EN: `Describe your first matter and Lawie will write a first draft for you to review.`
- Button EN: `Start your first draft`
- Heading HI: `अलमारी अभी खाली है`
- Body HI: `अपना पहला मामला बताइए। Lawie पहला ड्राफ़्ट लिखेगा, जिसे आप जाँचेंगे।`
- Button HI: `पहला ड्राफ़्ट शुरू कीजिए`
- Note under, if email not verified: `Verify your email to receive your 5 Ink.` / HI `5 Ink पाने के लिए अपना ईमेल सत्यापित कीजिए।`

### 3.3 Low-Ink nudge (below 3 Ink, warn banner or tile note)

| Case | Copy |
| --- | --- |
| Low | `{n} Ink left. You see the cost before every draft.` [AJAY TO SIGN, T-388 AC4] Buttons: `Top up` (primary), `See plans` (ghost) |
| Zero, on a plan | `You have no Ink left. It refills on {date}, or you can top up now.` |
| Zero, Free | `You have used your 5 Ink. Top up or choose a plan to keep drafting.` |
| Dismiss | `Not now` |

Hindi (key moment):

- Low: `{n} Ink बचा है। हर ड्राफ़्ट से पहले आपको लागत दिखती है।`
- Zero, plan: `आपका Ink समाप्त हो गया है। {date} को यह फिर भर जाएगा, या आप अभी टॉप-अप कर सकते हैं।`

### 3.4 Section labels (the eight items)

| # | Item | Label | Sub-label or empty value |
| --- | --- | --- | --- |
| 1 | Ink balance | `Ink balance` | `{n} Ink` |
| 2 | Recent documents | `Recent documents` | Link: `View all` |
| 3 | Drafts this month | `Drafts this month` | `{n}` |
| 4 | Draft vs finalised | `Draft and finalised` | `{a} draft, {b} finalised` |
| 5 | Plan and renewal | `Plan and renewal` | `{plan}, renews on {date}`; Free: `Free plan, no renewal` |
| 6 | Ink used this month | `Ink used this month` | `{used} Ink` |
| 7 | Drafts by type | `Drafts by type` | Empty: `No drafts yet` |
| 8 | Command bar | Label: `What do you need to draft?` | see 3.5 |

No time-saved line or tile. Tiles still loading show a skeleton, never a zero (spec).

### 3.5 Command bar

- Placeholder: `A bail application for a client arrested on Tuesday…`
- Keyboard hint: `Ctrl K` (Mac: `⌘ K`)
- Hint aria-label: `Press Control and K to jump here`
- Button: `Draft`
- Quick chips: `Bail application`, `Legal notice`, `Written statement`, `Plaint`, `Browse all templates`
- No results: `No template matches. Describe it in your own words and press Draft.`

### 3.6 Tile states

- Dashboard error: `Could not load your shelf. Your connection looks slow.` + `Retry`
- Recent documents empty: `No documents yet.` + `Start a draft`

---

## 4. Plan chooser and billing

### 4.1 Plan cards (Settings, Plan tab)

| Plan | Name | Price | Ink | Notes |
| --- | --- | --- | --- | --- |
| Free | `Free` | `₹0` | `5 Ink on sign-up, once your email is verified (lifetime)` | |
| Solo | `Solo` | `₹799 a month` | `50 Ink a month` | Highlighted if current |
| Pro | `Pro` | `₹1,999 a month` | `150 Ink a month` | |

Under the cards: `Prices include GST. Plan Ink does not carry over. Top-up Ink never expires.`

Hindi (key): `कीमतों में GST शामिल है। प्लान का बचा हुआ Ink आगे नहीं जुड़ता। टॉप-अप Ink कभी समाप्त नहीं होता।`

### 4.2 Labels and buttons

| Item | Copy |
| --- | --- |
| Current plan label | `Current plan` |
| Choose, not signed up to any plan | `Choose Solo` / `Choose Pro` |
| Upgrade from Solo | `Upgrade to Pro` |
| Move down | `Switch to Solo` (opens the switch note, 4.4) |
| Free card, other plans current | `Free plan` (no button) |
| Top-up button | `Top up Ink` |
| Retry payment | `Retry payment` |
| Payment pending | `Payment received. Your Ink will appear here in a moment.` |

### 4.3 Subscription status labels

| State | Label |
| --- | --- |
| Active | `Active` + `Renews on {date}` |
| Ends on | `Ends on {date}` |
| Payment failed | `Payment failed` |
| Lapsed | `Lapsed` + `Choose a plan to start again.` |

### 4.4 Cancel dialog and switching

- Link: `Cancel plan`
- Dialog title: `Cancel your plan?`
- Body: `Your plan ends on {date}. Ink you already have stays until then. Plan Ink does not carry over after that. Top-up Ink stays.`
- Destructive button: `Cancel plan`
- Ghost button: `Keep my plan`
- After cancel (toast): `Your plan will end on {date}.`
- Cancel error: `Could not cancel your plan. Try again.` + `Retry`
- Switch note (decision 6): `To change plans, cancel your current plan and choose the new one after {date}.` [CHECK: Priya to confirm the flow]

Hindi cancel dialog (key moment):

- Title: `अपना प्लान रद्द करें?`
- Body: `आपका प्लान {date} को समाप्त होगा। तब तक आपका मौजूदा Ink बना रहेगा। उसके बाद प्लान का Ink आगे नहीं जुड़ेगा। टॉप-अप Ink बना रहेगा।`
- Buttons: `प्लान रद्द कीजिए` / `प्लान बनाए रखिए`

### 4.5 Banners and gates

| Case | Copy |
| --- | --- |
| Payment failed banner | `Your last payment did not go through. Update your payment details to keep your plan.` + `Retry payment` |
| Verify email gate | `Verify your email to subscribe.` + `Resend email` |
| Privacy gate | `Please review and accept the updated Privacy Policy to continue.` + `Review and accept` |
| Razorpay closed | `Payment was not completed. You can try again.` |

### 4.6 Top-up dialog

- Title: `Top up Ink`
- Packs: `3 Ink, ₹65` / `10 Ink, ₹199` / `28 Ink, ₹499`
- Note: `Prices include GST. Top-up Ink never expires.`
- Buy button: `Buy`
- Loading: skeleton (no copy)
- Error: `Could not load top-up plans.` + `Retry`

---

## 5. Errors and states

| State | Heading | Body | Action |
| --- | --- | --- | --- |
| 404 | `This page is not on the shelf` | `Check the address, or go back to your dashboard.` | `Back to dashboard` |
| 500 | `Something went wrong on our side` | `Please try again.` Option A: `Your drafts are safe.` [CHECK] | `Retry`, `Back to dashboard` |
| Offline banner | | `You are offline. Reconnect to keep working.` | |
| AI down banner | | `Drafting is paused for now. Please try again shortly.` Option A: add `Your documents are still here.` [CHECK] | `Retry` |
| Still working (after 8 s) | | `Still working…` | |
| Top-up plans failed | | `Could not load top-up plans.` | `Retry` |
| Generic failure | | `Something did not work. Try again.` | `Retry` |
| Draft did not finish | | `The draft did not finish. You were not charged.` [AJAY TO SIGN, T-388 AC4] | `Try again` |
| Export failed (toast) | | `Could not export. Try again.` | `Retry` |
| Describe failed | | `Could not read your description. Try again.` Text kept. | `Retry` |
| Empty documents list | `No documents yet` | `Your drafts will appear here.` | `Start a draft` |
| Empty sessions list | | `Only this device is signed in.` | |

Hindi for the two key moments (500 and AI down):

- 500 HI: `हमारी तरफ़ से कुछ गड़बड़ हुई। कृपया दोबारा कोशिश कीजिए।`
- AI down HI: `ड्राफ़्टिंग अभी रुकी हुई है। कृपया थोड़ी देर में फिर कोशिश कीजिए।`

---

## 6. Settings and profile

### 6.1 Section titles

`Profile`, `Plan`, `Privacy`, `Account`, `Appearance`

HI: `प्रोफ़ाइल`, `प्लान`, `निजता`, `खाता`, `रूप-रंग`

### 6.2 Profile fields

| Field | Label | Help |
| --- | --- | --- |
| Name | `Name` | |
| Email | `Email` | `To change your email, contact support.` [CHECK: real behaviour] |
| Phone | `Phone` | `Optional` [CHECK] |
| Enrollment number | `Enrollment number` | `As on your Bar Council enrollment certificate` |
| Bar council | `Bar council` | |
| State | `State` | |
| Practice areas | `Practice areas` | `Choose all that apply` |
| Years of experience | `Years of experience` | |
| Courts practised in | `Courts practised in` | `Add the courts where you appear` |
| Default court | `Default court` | `Used to fill the court name in new drafts.` [CHECK: decision 7] |
| Save | `Save changes` | |

Lawie does not check enrollment numbers; do not write "verified" next to the field. [CHECK]

### 6.3 Toasts and errors

| Case | Copy |
| --- | --- |
| Saved | `Profile saved.` |
| Save error | `Could not save your profile. Try again.` |
| Field error | `Check this field and try again.` |
| Settings load error | `Could not load your settings.` + `Retry` |
| Password changed | `Password changed.` |
| Signed out of device | `Signed out of that device.` |

### 6.4 Theme toggle

- Label: `Theme`
- Options: `Night`, `Daylight`, `System`
- Help: `System follows your device setting.`
- HI: `थीम`, `रात`, `दिन`, `सिस्टम`

### 6.5 Vendor transparency line

Template (Ajay, exact): `This sends {what} to {vendor} in {country} to {purpose}.`

HI template: `इससे {what} {country} में {vendor} को भेजा जाता है, ताकि {purpose}।`

Examples [CHECK: vendor names and countries are mine to confirm with Ajay's vendor list]

- `This sends your description of the matter to Anthropic in the United States to write the draft.`
- `This sends your name, email and payment details to Razorpay in India to take payment.`
- Where shown: next to the Draft button on the describe screen, and on the payment dialog. Full vendor list sits in Settings, Privacy.

### 6.6 Privacy and account labels (spec screen 07)

- `Privacy notice version {version}, {date}`
- `Consent history`, `Withdraw consent`
- `Ask to access, correct or erase your data`
- `Grievance Officer: {name}, {email}. We reply within {days} days.` [CHECK: Ajay supplies the response time]
- Account: `Change password`, `Active sessions`, `Sign out`. Close-account and delete-document strings: section 6.7.

### 6.7 Delete document and close account (verbatim from handoff/marketing/copy/dpdp-ui-strings-t115.md, Ajay-signed where marked there)

Use that file as the source. Not reworded here. Strings in it that the file marks "Ajay, signed" or "Needs Ajay" keep those marks. Flag from that file: both dialog bodies end with the signed line `Backup copies are erased within 7 days.`

Delete a document (T-115b):

- Title: `Delete this document?`
- Body: `This deletes the document and everything in it, including its drafts and annexures. You cannot undo this. Ink used on it is not refunded.` + `Backup copies are erased within 7 days.`
- Buttons: `Delete document` / `Cancel`; list button `Delete`; aria-label `Delete {title}`; working `Deleting...`; screen reader `Deleting the document.`; success `Document deleted.`
- Error: `We could not delete this document. Try again.`

Close account (T-115c):

- Heading and button: `Close account`; description: `Close your Lawie account. You will be asked to confirm first.`
- Title: `Close your account and erase your data?`
- Body: `This erases your account, your profile and every document you have created on Lawie. Any unused Ink and any active plan end now and are not refunded. We keep payment and invoice records for as long as tax law requires. You cannot undo this.` + `Backup copies are erased within 7 days.`
- Buttons: `Close account and erase` / `Cancel`
- Password: label `Your password`; help `Enter your password to confirm it is you.`; Google-only: `Type your email address` / `Type the email address you sign in with, to confirm it is you.`
- Working: `Closing...` / `Closing your account. Please wait.`
- Errors: `That password is not right. Nothing was changed.`; `That email address does not match. Nothing was changed.`; `Cancel your plan first.` + `Go to Plan` (fallback `Write to contact@lawie.in to cancel.`); `We could not close your account. Try again.`; old Google session add `Sign in again, then try once more.`; mid-erase `We couldn't finish closing your account. Some of your data may not be erased yet. Please try again, or write to us at {support email} and we will finish it.`
- /account-closed page: `Your account is closed` / `You have been signed out.` / `Thank you for using Lawie.` / `Go to the home page`

---

## 7. Words I avoided on purpose

Never used: never miss, court-ready, filing-ready, legally valid, 100% accurate, guaranteed, unlimited, time-saved figures, best, top (as ranking), get more clients, rankings, testimonials, results, citations, case names, photo intake, yearly plans, diary, reminders, e-sign, client email. "Top up" is the action name only. "Accuracy" appears only inside Ajay's disclaimer line.

Ready for next task.


---

## Priya's decisions on the open points (17 Oct 2026)

1. **"Free" wording:** use "Start with 5 free Ink" everywhere (T-398 allows "free" only with "5 Ink").
2. **Pro:** the landing page shows Free and Solo only, with a "See all plans" link to the pricing page. Pro appears on the pricing page and in the logged-in plan chooser (Vikram: Pro stays out of ads and the landing page). Remove Pro from the landing page copy.
3. **Plan switch:** cancel at the end of the cycle, then buy the new plan. No proration.
4. **Default court:** pre-fills the court on every new draft; the advocate can change it per draft.
5. **Document types:** list only the types that appear in the app's template picker today. The web lead confirms the list against the picker before launch.
6. **Vendor names and countries:** placeholders until Arjun and Ajay name the real vendors; keep the {vendor} and {country} tokens.
7. **"Drafts are safe" and "documents still here" lines:** keep them only if Arjun confirms the app really saves them; otherwise delete.
8. The FAQ sentence about "2 Ink / 1 Ink" stays removed.
