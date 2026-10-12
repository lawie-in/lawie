# Site copy: the "secure / encrypted" claims, and the Terms of Service (signed)

Ajay (CLO), 12 Oct 2026 IST. Read: `(marketing)/page.tsx` (FAQ, lines ~126 to 128), `(marketing)/faq/page.tsx` (~81), `pricing/page.tsx` (~27), `faq/page.tsx` (~68), `PaywallModal.tsx` (~143), `terms/page.tsx` in full. Against: the signed Privacy Policy (T-235, section 4: drafts and briefs are encrypted; form answers and the fact list are not; section 3: no backups).

## A. "Is my case data secure?" (home FAQ) and the same answer on the FAQ page

A public answer that says "Your documents are encrypted in storage" is false for the form answers and the fact list. Replace the question and the answer in **both** places (`(marketing)/page.tsx` ~126 to 128 and `faq/page.tsx` ~81):

Question: `How is my case data handled?`

Answer: `Your drafts and briefs are encrypted in our database, and connections to Lawie use HTTPS. Your form answers and the list of facts Lawie builds from your matter are not yet encrypted in the same way. We do not currently keep backups, so download and keep your own copy of every document you need. Lawie uses your case details only to create your drafts. The Privacy Policy lists what we store, where, and who else receives it.`

(Same facts as Privacy §3 and §4. When the founder moves off the free database tier, or encrypts the form answers, I give the narrower line.)

## B. Payment lines

| Where | Replace | With |
|---|---|---|
| `pricing/page.tsx` ~27 and `faq/page.tsx` ~68 | `Payments are processed securely through Razorpay, which supports ...` | `Payments are processed through Razorpay, which supports ...` (rest unchanged). "Securely" is a security claim about a third party that we have not checked |
| `PaywallModal.tsx` ~143 | `Secure payments via Razorpay · GST invoice provided` | `Payments via Razorpay`. "GST invoice provided" stays out until Vikram confirms that Lawie issues GST invoices (his CA check is open) |

## C. Terms of Service (`terms/page.tsx`), word for word

1. `Last updated:` the merge date, and **bump `termsVersion`** (the Terms and the Privacy Policy change together).
2. **§2 Description of Service.** Replace the paragraph with: `Lawie is a drafting assistant for advocates. It creates first drafts of legal documents for the advocate to review, edit and download. Criminal drafts cite BNS, BNSS and BSA. The Service does not provide legal advice or representation.` ("Formatted for Indian courts" and "built around the current criminal codes" are claims we do not make.)
3. **§3 heading** `AI-Assisted Drafting Disclaimer` becomes `Drafting Disclaimer`. The first sentence `Lawie is an AI-assisted drafting tool — not a substitute for legal advice.` becomes `Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.` The rest of §3 stays.
4. The intro under the title: `... and the limits of what an AI-assisted drafting tool can do.` becomes `... and the limits of what a drafting assistant can do.`
5. **§6 Subscription & Billing**: add after the first sentence: `Drafts are paid for with Ink. Most documents use 2 Ink; short ones use 1. You are charged only after a draft is generated; a failed generation is not charged.` At the end of §6, after `as set out in our Refund Policy.`, add: `This does not affect any right you have under law.`
6. **§9 Limitation of Liability**: add at the end: `Nothing in these Terms limits any liability that cannot be limited by law.`
7. **§12 Governing Law**: add at the end: `Nothing in this section limits any right you have to approach a Consumer Commission where you live or work.`
8. **§14 Contact**: `legal@lawie.in`. Arjun or Priya confirms that this mailbox exists and is read; the signed contacts elsewhere are `contact@lawie.in` and `privacy@lawie.in`. If `legal@` does not exist, use `contact@lawie.in`.
9. Nothing else in the Terms changes. The assistant (T-253) and the erase-on-request text come with their own tickets.

## D. Open points for others (not mine to decide)

| Point | Owner |
|---|---|
| Automatic renewal of subscriptions: pre-debit notice and consent for recurring payments under the RBI rules | Vikram and Arjun (Razorpay set-up) |
| Whether the blanket "non-refundable" wording survives a review under the Consumer Protection Act, 2019 (the Refund Policy and the pricing FAQ say the same) | Me: separate review; no change asked tonight except the sentence in C.5 |
| GST invoices | Vikram |

Signed: Ajay (CLO), 12 Oct 2026 IST. Any other wording comes back to me.

## Addendum (12 Oct 2026 IST): T-268 contents entry and meta description

1. "On this page" entry for §3: `3. Drafting Disclaimer` (matches the heading).
2. Meta description: replace "an AI-assisted legal drafting tool for Indian advocates" with `a drafting assistant for Indian advocates`; the rest of the description stays.
