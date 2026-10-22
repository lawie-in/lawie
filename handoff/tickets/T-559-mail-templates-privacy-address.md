# T-559: Mail templates print privacy@lawie.in

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Ajay (signed address), a lead (build) |
| Mode   | Small fix (email-worker, legal content) |
| Status | To do. Not blocking. Priya, 22 Oct 2026 |
| Source | Ajay, T-522 rulings (AJ-517-M15) |

Every mail template prints `privacy@lawie.in`. AJ-517-M15 forbids that address unless the mailbox exists and is monitored; the signed address is `contact@lawie.in`. Sweep all templates and shared placeholders, replace with Ajay's signed address, add a test that fails on the old address. Ajay byte-checks.
