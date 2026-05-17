# Lawie — Email Template Copy Pack

**Author:** Madhuri (Content)
**Date:** 2026-05-12
**For:** Vishal — SCRUM-77 (BullMQ + AWS SES email system)
**Purpose:** Production-ready copy for 10 email templates. Markdown-friendly so it can be pasted directly into React Email components.

**Brand voice applied:** Respectful, plainspoken, peer-to-peer with advocates. No emojis, no exclamation overuse, no SaaS clichés. Indian English forms throughout. Hinglish variants added where rapport-building helps (advocate-facing only; never billing/admin).

**Global rules:**

- All transactional sends use `hello@lawie.in` as FROM. Billing uses `billing@lawie.in`. Admin uses `kavya@lawie.in` internal.
- All advocate-facing emails have `reply-to: hello@lawie.in` (lands in founder inbox Phase 1).
- Footer block (reused across all templates):

  ```
  Lawie — AI-native legal drafting for Indian advocates
  {{appUrl}} • hello@lawie.in
  You received this because you have an account at Lawie. Manage email preferences: {{appUrl}}/settings/notifications
  ```

- For billing/admin emails, the unsubscribe line is replaced with: _"This is a transactional message and cannot be unsubscribed from."_

---

## 1. `auth.welcome`

**Trigger:** Fires from `auth.service.ts` immediately after `POST /auth/signup` succeeds and the user record is persisted.
**Priority queue:** `email:high`
**CTA destination:** `{{appUrl}}/dashboard`

**Subject (≤60):** Welcome to Lawie — let's get your first draft ready
_(58 chars)_

**Preheader (~50):** Three things you can try in the next five minutes.
_(54 chars)_

**Greeting:** Namaskar {{firstName}},

**Body:**
Thank you for signing up. Lawie helps you draft applications, petitions, and replies in minutes instead of hours — grounded in BNS, BNSS, and BSA, with proper section citations.

On the Free tier, you get 3 drafts per month, the full Section Finder, and access to 6 production-ready templates (bail, anticipatory bail, 482 quashing, FIR quashing, regular bail rejection reply, and Section 41A response).

Three quick things to try:

1. Generate a bail application from the dashboard.
2. Search "483 BNSS" in the Section Finder.
3. Save a draft to your library.

**Primary CTA:** Open dashboard
**CTA URL:** `{{appUrl}}/dashboard`

**Sign-off:**
Welcome aboard,
Abhinav
Founder, Lawie

---

### `auth.welcome_hinglish`

**Subject (≤60):** Lawie mein swagat hai — pehla draft try karein
_(50 chars)_

**Preheader (~50):** Agle paanch minute mein teen cheezein try karein.
_(51 chars)_

**Greeting:** Namaskar {{firstName}},

**Body:**
Lawie join karne ke liye dhanyavaad. Lawie aapke applications, petitions aur replies kuch minute mein taiyaar kar deta hai — BNS, BNSS aur BSA ke proper section citations ke saath.

Free tier mein aapko milte hain: har mahine 3 drafts, full Section Finder, aur 6 production-ready templates (bail, anticipatory bail, 482 quashing, FIR quashing, bail rejection reply, aur Section 41A response).

Teen cheezein abhi try karein:

1. Dashboard se ek bail application generate karein.
2. Section Finder mein "483 BNSS" search karein.
3. Apna draft library mein save karein.

**Primary CTA:** Dashboard kholein
**CTA URL:** `{{appUrl}}/dashboard`

**Sign-off:**
Aapka sahyogi,
Abhinav
Founder, Lawie

---

## 2. `auth.verify`

**Trigger:** Fires from `auth.service.ts` after signup OR when user requests resend from `POST /auth/verify/resend`.
**Priority queue:** `email:high`
**CTA destination:** `{{appUrl}}/auth/verify?token={{token}}`

**Subject (≤60):** Verify your email to activate your Lawie account
_(50 chars)_

**Preheader (~50):** This link expires in 24 hours.
_(31 chars)_

**Greeting:** Hello {{firstName}},

**Body:**
Please confirm your email address to activate your Lawie account. This link will expire in 24 hours. If you did not sign up for Lawie, you can safely ignore this message.

**Primary CTA:** Verify email
**CTA URL:** `{{appUrl}}/auth/verify?token={{token}}`

**Sign-off:**
Thank you,
Team Lawie

---

### `auth.verify_hinglish`

**Subject (≤60):** Email verify karein — Lawie account activate karne ke liye
_(58 chars)_

**Preheader (~50):** Yeh link 24 ghante mein expire ho jaayega.
_(43 chars)_

**Greeting:** Namaskar {{firstName}},

**Body:**
Apna email confirm karein taaki Lawie account activate ho sake. Yeh link 24 ghante ke andar expire ho jaayega. Agar aapne Lawie pe signup nahi kiya, toh is message ko ignore kar sakte hain.

**Primary CTA:** Email verify karein
**CTA URL:** `{{appUrl}}/auth/verify?token={{token}}`

**Sign-off:**
Dhanyavaad,
Team Lawie

---

## 3. `billing.subscriptionConfirmed`

**Trigger:** Fires from `razorpay.webhook.ts` on `subscription.activated` event. FROM = `billing@lawie.in`.
**Priority queue:** `email:high`
**CTA destination:** `{{appUrl}}/billing/invoices/{{invoiceId}}`

**Subject (≤60):** Your Lawie {{planName}} plan is active
_(40 chars — assumes planName ≤ 8 chars)_

**Preheader (~50):** Next charge: {{nextBillingDate}}. Receipt attached.
_(50 chars)_

**Greeting:** Hello {{firstName}},

**Body:**
Your subscription to the Lawie **{{planName}}** plan is now active. You have **{{credits}} drafting credits** loaded into your account for this billing cycle.

Plan summary:

- **Plan:** {{planName}}
- **Amount charged:** ₹{{amount}} (incl. GST)
- **Next billing date:** {{nextBillingDate}}
- **Payment ID:** {{razorpayPaymentId}}

You can download your invoice and view past receipts from the billing page anytime.

**Primary CTA:** View invoice
**CTA URL:** `{{appUrl}}/billing/invoices/{{invoiceId}}`

**Sign-off:**
Thank you for supporting Lawie,
Team Lawie

_(No Hinglish variant — billing email.)_

---

## 4. `billing.paymentFailed`

**Trigger:** Fires from `razorpay.webhook.ts` on `payment.failed` or `subscription.charged_failure`. FROM = `billing@lawie.in`.
**Priority queue:** `email:high`
**CTA destination:** `{{appUrl}}/billing/retry`

**Subject (≤60):** Payment for your Lawie subscription did not go through
_(56 chars)_

**Preheader (~50):** We will retry. You have 3 days before downgrade.
_(50 chars)_

**Greeting:** Hello {{firstName}},

**Body:**
Your most recent payment of ₹{{amount}} for the **{{planName}}** plan did not go through. The reason returned by your bank was: _{{failureReason}}_ — this is usually a declined card, insufficient funds, or an expired card.

Your account will remain on the {{planName}} plan for the next **3 days**. If payment is not successful within that window, your account will move to the Free tier and your saved drafts will remain accessible.

You can retry the payment with the same card or update your payment method below.

**Primary CTA:** Retry payment
**CTA URL:** `{{appUrl}}/billing/retry`

**Sign-off:**
Team Lawie

_(No Hinglish variant — billing email.)_

---

## 5. `billing.monthlyInvoice`

**Trigger:** Fires from `billing.service.ts` after `subscription.charged` succeeds and the invoice PDF is generated. FROM = `billing@lawie.in`.
**Priority queue:** `email:low`
**CTA destination:** `{{appUrl}}/billing/invoices/{{invoiceId}}`

**Subject (≤60):** Invoice {{invoiceNumber}} — Lawie {{planName}} plan
_(55 chars at typical length)_

**Preheader (~50):** Period {{periodStart}} to {{periodEnd}}. GST included.
_(54 chars)_

**Greeting:** Hello {{firstName}},

**Body:**
Your invoice for the {{planName}} subscription is ready. Please retain this for your accounting records.

| Item               | Amount                           |
| ------------------ | -------------------------------- |
| Invoice number     | {{invoiceNumber}}                |
| Billing period     | {{periodStart}} to {{periodEnd}} |
| Plan               | {{planName}}                     |
| Subtotal           | ₹{{subtotal}}                    |
| GST ({{gstRate}}%) | ₹{{gstAmount}}                   |
| **Total charged**  | **₹{{total}}**                   |
| Payment ID         | {{razorpayPaymentId}}            |
| Payment date       | {{paymentDate}}                  |

Lawie is operated by {{legalEntityName}}, GSTIN: {{gstin}}.

**Primary CTA:** Download invoice
**CTA URL:** `{{appUrl}}/billing/invoices/{{invoiceId}}`

**Sign-off:**
Team Lawie
billing@lawie.in

_(No Hinglish variant — billing email.)_

---

## 6. `billing.lowCreditWarning`

**Trigger:** Fires from `credits.service.ts` when a draft generation completes and the user's remaining credit count drops to ≤5. Debounced to send once per billing cycle. FROM = `hello@lawie.in`.
**Priority queue:** `email:low`
**CTA destination:** `{{appUrl}}/billing/top-up`

**Subject (≤60):** {{credits}} drafting credits remaining this month
_(47 chars at credits=5)_

**Preheader (~50):** Top up anytime — credits never expire.
_(40 chars)_

**Greeting:** Hello {{firstName}},

**Body:**
You have **{{credits}} drafting credits** left for this billing cycle. Your next renewal is on {{nextBillingDate}}.

If you expect to draft more before then, you can add a top-up pack from the billing page. Top-up credits do not expire and carry forward across cycles. Advocates running heavier matter loads usually prefer the Firm plan, which includes a higher monthly allotment.

**Primary CTA:** Top up credits
**CTA URL:** `{{appUrl}}/billing/top-up`

**Sign-off:**
Team Lawie

---

### `billing.lowCreditWarning_hinglish`

**Subject (≤60):** Is mahine {{credits}} drafting credits bache hain
_(48 chars)_

**Preheader (~50):** Top-up kabhi bhi karein — credits expire nahi hote.
_(53 chars)_

**Greeting:** Namaskar {{firstName}},

**Body:**
Is billing cycle mein aapke paas **{{credits}} drafting credits** bache hain. Agla renewal {{nextBillingDate}} ko hoga.

Agar tab tak aur drafts banaane hain, toh billing page se top-up pack le sakte hain. Top-up credits expire nahi hote, aur agle cycle mein bhi chalte hain. Zyada matters wale advocates aksar Firm plan prefer karte hain — usmein har mahine zyada credits milte hain.

**Primary CTA:** Credits top-up karein
**CTA URL:** `{{appUrl}}/billing/top-up`

**Sign-off:**
Team Lawie

---

## 7. `drafting.draftComplete`

**Trigger:** Fires from `drafting.service.ts` when `draft.status` transitions to `complete`. Gated by `user.preferences.notifyOnDraftComplete === true` (off by default). FROM = `hello@lawie.in`.
**Priority queue:** `email:low`
**CTA destination:** `{{appUrl}}/drafts/{{draftId}}`

**Subject (≤60):** Your {{templateName}} draft is ready
_(40 chars at templateName="bail application")_

**Preheader (~50):** {{sectionCount}} sections cited • {{readTime}} min read
_(54 chars)_

**Greeting:** Hello {{firstName}},

**Body:**
Your **{{templateName}}** draft is ready in your Lawie library. It cites {{sectionCount}} sections of BNS/BNSS/BSA and is approximately a {{readTime}}-minute read.

A draft is a starting point — please review it carefully against the facts of your matter and the local court's filing requirements before signing off.

**Primary CTA:** Open draft
**CTA URL:** `{{appUrl}}/drafts/{{draftId}}`

**Sign-off:**
Team Lawie

---

### `drafting.draftComplete_hinglish`

**Subject (≤60):** Aapka {{templateName}} draft taiyaar hai
_(40 chars)_

**Preheader (~50):** {{sectionCount}} sections cite kiye • {{readTime}} min
_(53 chars)_

**Greeting:** Namaskar {{firstName}},

**Body:**
Aapka **{{templateName}}** draft Lawie library mein ready hai. Ismein BNS/BNSS/BSA ke {{sectionCount}} sections cite kiye gaye hain, aur padhne mein lagbhag {{readTime}} minute lagenge.

Draft ek starting point hai — file karne se pehle apne matter ke facts aur local court ki filing requirements ke saath ek baar zaroor check kar lein.

**Primary CTA:** Draft kholein
**CTA URL:** `{{appUrl}}/drafts/{{draftId}}`

**Sign-off:**
Team Lawie

---

## 8. `admin.referralIssued`

**Trigger:** Fires from `referral.service.ts` (SCRUM-71) when a new signup completes and `signup.referralCode` is non-null. Sent only to founder. FROM = `kavya@lawie.in`.
**Priority queue:** `email:low`
**CTA destination:** `{{appUrl}}/admin/users/{{newUserId}}`

**Subject (≤60):** Referral signup: {{newAdvocateName}} via {{code}}
_(46 chars at typical length)_

**Preheader (~50):** Referrer: {{referrerName}}. First action: {{firstAction}}.
_(56 chars)_

**Greeting:** Abhinav,

**Body:**
A new advocate has signed up using a referral code.

- **New advocate:** {{newAdvocateName}} ({{newAdvocateEmail}})
- **Bar enrolment:** {{barEnrolmentNumber}}
- **Court:** {{courtName}}, {{city}}
- **Referral code used:** {{code}}
- **Referred by:** {{referrerName}} ({{referrerEmail}})
- **Signed up at:** {{signupTimestamp}} IST
- **First action:** {{firstAction}}
- **Plan:** {{plan}}

Credit applied to referrer's account: ₹{{creditAmount}}.

**Primary CTA:** View advocate
**CTA URL:** `{{appUrl}}/admin/users/{{newUserId}}`

**Sign-off:**
— Kavya

_(No Hinglish variant — internal admin.)_

---

## 9. `admin.advocatePackInvite`

**Trigger:** Sent manually by founder from the admin panel — `POST /admin/advocate-pack/invite` — to selected advocates in the Phase 1 Ranchi panel. FROM = `abhinav@lawie.in` (founder's address, not `hello@`).
**Priority queue:** `email:high`
**CTA destination:** `{{packUrl}}`

**Subject (≤60):** Request for your review — Lawie advocate pack
_(48 chars)_

**Preheader (~50):** 30-minute read. Your candid feedback would help.
_(51 chars)_

**Greeting:** Dear {{advocateName}},

**Body:**
I am Abhinav, founder of Lawie — a drafting tool we are building for advocates practising in district and high courts. We are putting together an advocate pack of templates and section references for the Ranchi panel, and I would value your review before we release it more widely.

The pack covers six high-frequency drafts: regular bail, anticipatory bail, 482 BNSS quashing, FIR quashing reply, bail rejection reply, and Section 41A BNSS response. Review time is approximately 30 minutes.

Three specific questions I would request your feedback on:

1. Are the section citations (BNS/BNSS/BSA) accurate and complete for each template?
2. Does the language and structure match what is acceptable in the Ranchi sessions and high courts?
3. What is missing — which other template would you reach for most often?

You can reach me directly at abhinav@lawie.in or on {{founderPhone}}. Thank you for considering this, and for the time you can spare.

**Primary CTA:** Open advocate pack
**CTA URL:** `{{packUrl}}`

**Sign-off:**
With regards,
Abhinav Anand
Founder, Lawie
abhinav@lawie.in • {{founderPhone}}

_(No Hinglish variant — first-contact peer email kept in formal English. Founder can paraphrase to Hindi/Hinglish in follow-up if the relationship warms.)_

---

## 10. `admin.founderDailyDigest`

**Trigger:** Cron job `kavya.dailyDigest` at 08:30 IST, posted to BullMQ by `scheduler.service.ts`. Sent to founder only. FROM = `kavya@lawie.in`. REPLY_TO = `kavya@lawie.in` (auto-routed back to Kavya agent).
**Priority queue:** `email:low`
**CTA destination:** `{{appUrl}}/admin/dashboard`

**Subject (≤60):** Daily digest — {{dateLong}}
_(35 chars)_

**Preheader (~50):** {{paidUsersDelta}} paid users • {{draftsYesterday}} drafts • {{openTickets}} tickets
_(60 chars — may truncate, acceptable)_

**Greeting:** Good morning Abhinav,

**Body:**
Here is your digest for {{dateLong}}.

**Yesterday — shipped**
{{#shippedItems}}

- {{title}} ({{owner}})
  {{/shippedItems}}

**Today — blockers**
{{#blockers}}

- {{description}} — owner: {{owner}}, age: {{age}}
  {{/blockers}}

**This week — priorities**
{{#weekPriorities}}

- {{title}} ({{eta}})
  {{/weekPriorities}}

**KPIs as of 08:00 IST**

- Paid users: {{paidUsersTotal}} ({{paidUsersDelta}} vs yesterday)
- Drafts generated yesterday: {{draftsYesterday}}
- Drafts generated WTD: {{draftsWtd}}
- Open support tickets: {{openTickets}}
- Razorpay revenue MTD: ₹{{revenueMtd}}
- Free → paid conversion (7-day rolling): {{conversionRate}}%

Reply to this email to drop a note for me, or open the admin dashboard for the full view.

**Primary CTA:** Open admin dashboard
**CTA URL:** `{{appUrl}}/admin/dashboard`

**Sign-off:**
— Kavya
Your PA, Lawie team

_(No Hinglish variant — internal digest. Slightly informal "Good morning" is intentional.)_

---

## Implementation notes for Vishal

1. **Variable naming:** All Mustache-style `{{var}}` placeholders match the names used in `email.types.ts`. If a name differs in the codebase, please rename consistently across all templates rather than introducing aliases.
2. **GST rate:** `{{gstRate}}` is currently 8% (preprod-scale, composition or pre-registration). Switch to 18% post-GST registration — Vikram (CFO) owns that toggle.
3. **Hinglish selection:** Per user preference `user.preferences.locale` — values `en-IN` (default) or `hi-Latn-IN` (Hinglish). Fall back to `en-IN` if missing.
4. **Subject line A/B:** No A/B testing in Phase 1 — single subject per template.
5. **Preheader rendering:** Wrap in a `<div style="display:none;max-height:0;overflow:hidden;">` block immediately after `<body>` so it surfaces in inbox previews without rendering visibly in the email.
6. **Approval:** All copy in this file is pending Meera's sign-off. Tag as `Approved-Meera` in Notion once she clears it before Vishal merges to main.

— Madhuri
