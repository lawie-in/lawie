# T-701: A yearly refund stops the remaining monthly Ink

Status: backlog, P2, billing only. Starts after T-646 merges, since T-646 stamps each monthly Ink grant with the yearly payment id. Raised 30 Oct 2026 by Priya from Vikram via Arjun (handoff/design/T-646-payment-ink-history-concern.md, round 3b). If T-646 already touches the yearly refund path, this folds into T-646.

Today a statutory refund of a yearly plan charge leaves the monthly Ink grants running, so the customer keeps getting Ink for money that was returned.

## Acceptance criteria
1. A refund of a yearly charge takes back the unspent Ink from the current month and stops the remaining monthly grants for that payment.
2. Ink already spent is not taken back. Other payments and their grants are untouched.
3. The refund and the reversal show in the customer's payment and Ink history (T-646).
4. Tests: a full refund mid-year, a refund in the first month, and a refund after some Ink has been spent.
