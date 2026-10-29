# T-665 — Arrest dates and the custody answer come from the ledger too

Status: assigned to tanvi, 29 Oct 2026. Follow-up to T-660 (merged 3bf05b39). Ajay: ship T-660 with a note, ticket this.

## Why
T-660 made `ledgerCustodyInputs` the one source for ledger wording in the brief and in generation. The arrest dates and the custody answer are still read from the brief's own items, not from the ledger.

## Acceptance criteria
1. `ledgerCustodyInputs` also carries the ledger's arrest dates and its custody answer. The brief and generation both read them from there.
2. The existing agreement test (one ledger through both the brief and generation) is extended to cover arrest dates and the custody answer.
3. There are no new strings and no rule or word-list change. Bail is legal content, so Ajay signs off before merge.

## Mode
Small fix (drafting only), legal content.
