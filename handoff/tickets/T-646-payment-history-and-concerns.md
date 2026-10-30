# T-646 — Payment and Ink history, and raising a payment concern

Status: READY (shashank, feature/t-646-payment-history @ be7d0b5d, 30 Oct 2026; Arjun reviewer PASS, Ajay AJ-646-BC 4539fcdf). Merge waits on the founder's .env.example SUPPORT_NOTIFY_EMAIL line. Follow-ups: T-701, T-702. Was: assigned to shashank, 28 Oct 2026 (Explore + gates first). Founder ask, 27 Oct 2026: "That's important. That's transparency."

## Problem
Today a customer can see only issued invoices (Settings → Invoices, T-436). There is no list of payments: not failed or pending ones, top-ups, plan charges or refunds. There is also no record of how Ink was used. And there's no way to raise a concern about a payment from the product.

## Acceptance criteria
1. **Payment history** in Settings, under Plan/Invoices. Each payment, newest first, shows:
   - date (IST), what it was for (plan/top-up), amount in ₹;
   - status (paid, failed, pending, refunded);
   - the Razorpay payment reference (last part only);
   - a link to its invoice, if one exists.
   Only the customer's own payments are shown.
2. **Ink history:** credits added (purchase, plan, grant) and used (per document generated, with the document title and date), plus the running balance. Document content is never shown here; the title only.
3. **Raise a concern** on any payment row. The customer picks a reason (charged but no Ink, double charge, wrong amount, refund request, other) and adds a short note. It's stored against that payment, the customer gets an acknowledgement email and sees the concern's status on the row. The founder/support gets notified.
4. The concern flow follows the refund policy and the grievance officer details (Ajay). Response times shown only as Ajay signs them.
5. Payment data comes from our billing records (Razorpay webhooks and the payment model). No new third-party logging of payment details.
6. Tests: own-payments-only (another user's ids → 404), each status rendered, the concern stored and the email queued, Ink running balance correct.

## Gates before build
- Rajesh: design for the history list and the concern form.
- Ajay: concern-flow wording, refund/grievance references, consumer-protection (e-commerce rules) check.
- Vikram: which statuses and amounts are shown, the refund handling SLA.
- Arjun: whether concerns are a new collection in billing, and where the support notification goes.

## Related
Invoices stay empty on prod until GST_EFFECTIVE_FROM is set (founder env line).

## Vikram (28 Oct 2026): statuses, amounts, refunds, start date

**1. Statuses shown:** Paid, Failed, Processing, Refunded, Partly refunded. One status per row, from the Razorpay payment entity, never from our order alone.
- **Failed** rows are shown only when there was a payment attempt (a Razorpay payment exists). Under them: "If money left your account, your bank returns it automatically." Ajay words the timing.
- **Partly refunded** shows both figures: amount paid, amount refunded.

**2. Orders started but never paid:** hide them. An order with no payment attempt is not a payment. Only someone who closed the checkout made one, and showing it as "pending" invites false concerns.
- A payment that *was* attempted and not yet settled shows as **Processing**. When the webhook or a check against Razorpay settles it, the row updates.
- Still Processing 24 h after the attempt: one Sentry alert. The row then says "We're checking this payment". Never hide a row where money may have moved.

**3. Amounts:** the amount actually charged, from the Razorpay payment (not the SKU price), **GST-inclusive, with paise**: "₹65.00 incl. GST". That matches the invoice to the paisa. Refund rows show the refunded amount. Each row also shows the Ink it added, and for a refund the Ink taken back (point 5).

**4. Refund SLA:** our policy is no refunds (Ajay, 13 Oct), except the statutory cases: double charge, charged but no Ink, a failed service. For those:
- **We acknowledge a concern within 1 working day.**
- **We decide within 3 working days.** An approved refund is started in Razorpay the same day it is decided.
- **The bank credits it, normally in 5–7 working days.** This is the bank's timing, not ours. Say "normally", never promise a date.
- A refund always goes back to the original payment method, never as Ink or credit, unless the customer asks.
Ajay signs the wording and the grievance reference.

**5. Refunds reverse Ink: yes.** Today a refunded purchase keeps its Ink, which is a leak. The founder's refunded ₹65 test on 25 Oct kept its 3 Ink.
- **Full refund:** debit the Ink that payment granted. Partial refund: debit the same share, rounded down. Ledger key `refund:<refundId>`, idempotent.
- **The balance never goes below zero.** If the Ink is already spent, debit what is left and log the shortfall (no PII) for support. Support factors spent Ink into the refund decision before approving it, so this is rare.
- A credit note already follows every refund (T-436); the Ink reversal rides the same refund event.

**6. History starts:**
- **Paid and refunded payments: backfill from Razorpay from prod go-live (23 Oct 2026).** Money moved, so the record is reliable.
- **Failed and processing: from the deploy date only**, since earlier ones are not reliable.
- The pre-Ink ₹199 test of 15 Jun ("credits") is not backfilled. It belongs to the old product and a different account.

Vikram, CFO
