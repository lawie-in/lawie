# T-665 — Arrest dates and the custody answer come from the ledger too

Status: built, READY 29 Oct (61907638), awaiting Ajay byte check. Ajay rulings 2af703ea, 309b4377. Batch note: the custody question is asked more often (by design).

## Why
T-660 made `ledgerCustodyInputs` the one source for ledger wording in the brief and in generation. The arrest dates and the custody answer are still read from the brief's own items, not from the ledger.

## Acceptance criteria
1. `ledgerCustodyInputs` also carries the ledger's arrest dates and its custody answer. The brief and generation both read them from there.
2. The existing agreement test (one ledger through both the brief and generation) is extended to cover arrest dates and the custody answer.
3. There are no new strings and no rule or word-list change. Bail is legal content, so Ajay signs off before merge.

## Mode
Small fix (drafting only), legal content.
