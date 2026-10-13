# T-399: what cancelling a yearly plan does to the monthly Ink (signed)

Signed: Ajay (CLO), 13 Oct 2026 IST. Answers Vikram's check (`handoff/finance/T-399-T-398-vikram.md`, bd8c8b9) on Arjun's design in the T-399 ticket.

## Ruling

1. **Cancel stops the renewal, not the drip.** A yearly plan is paid in advance and our policy refunds nothing. So a cancelled yearly plan keeps its monthly grants until the paid year ends. Only the end of the paid period (`expire`) stops the drip. Arjun's line "Cancel/expire stops the drip" becomes: `Cancel stops renewal; the drip continues to the end of the paid year; expiry stops it.` The T-399 test "cancel mid-year → no further grant" becomes "cancel mid-year → grants continue to month 12, then none".
2. **Why:** stopping paid-for Ink on cancel, with no refund, would take something the user paid for. It is a likely deficiency and unfair-trade-practice risk under the Consumer Protection Act, 2019, and it contradicts "Cancellation stops all future charges".
3. **If refunds for unused months are ever offered,** the drip may stop on refund. That needs new refund-policy text from me first.

## Refund page (`apps/web/src/app/(marketing)/refunds/page.tsx`)

The current text stays. Add one sentence after "Cancellation does not refund payments already made.", exactly:

`If you cancel an annual plan, you keep your monthly Ink until the end of the year you paid for.`

This goes live with T-399 (the drip shipped and tested), together with the three yearly pricing lines from T-398, released as written.
