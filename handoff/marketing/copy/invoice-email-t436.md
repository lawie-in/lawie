# T-436 invoice email (`billing.invoice`)

**NEEDS AJAY before it is built.** Madhuri, 14 Oct 2026. Draft for Ajay, then Meera.
Merge fields only: `{name}` `{invoiceNumber}` `{amount}` `{date}` `{downloadUrl}`. Link only, no attachment. Transactional, sender `Lawie <noreply@lawie.in>`.
Anchor, Ajay, signed: "Email it to the account email and keep it in the account."

| Part | Copy | Chars |
| --- | --- | --- |
| Subject (A) | Your Lawie invoice {invoiceNumber} | 34 |
| Subject (B) | Invoice {invoiceNumber} from Lawie | 34 |
| Preheader | Payment received on {date}. Your invoice is ready to download. | 61 |
| Button (A) | Download invoice (PDF) | 22 |
| Button (B) | Download your invoice | 21 |

## Body (HTML: same lines, with the button "Download invoice (PDF)" in place of the link line) and plain text

```
Hello {name},

Thank you for your payment of {amount} on {date}.
Your invoice number is {invoiceNumber}.

Download invoice (PDF): {downloadUrl}

Need help? Write to contact@lawie.in.
Team Lawie
```

## Footer

```
Lawie (Sole Proprietorship), [Ajay to confirm footer address]
You are receiving this because a payment was made on a Lawie account.
Help: contact@lawie.in · Data and privacy requests: privacy@lawie.in
Privacy Policy: https://lawie.in/privacy · Terms: https://lawie.in/terms
```

## For Ajay

- Footer address: his file gives none (config only). "Patna, Bihar" not copied; GST State is Jharkhand (20).
- Footer line 2 is new wording; needs sign-off.
- Subject and button say "invoice"; his signed term is "GST tax invoice". Which one?
- Amount and invoice number appear in the body (link-only email otherwise). Acceptable?
