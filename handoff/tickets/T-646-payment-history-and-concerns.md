# T-646 — Payment and Ink history, and raising a payment concern

Status: backlog (unassigned). Founder ask, 27 Oct 2026: "That's important. That's transparency."

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
