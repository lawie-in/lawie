# T-559: Mail templates print privacy@lawie.in

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Ajay (signed address), a lead (build) |
| Mode   | Small fix (email-worker, legal content) |
| Status | Ready to build, MUST before Anushka (Ajay: the verify mail footer still says privacy@). Signed AJ-559-M1, 22 Oct 2026. Vishal next after T-522 CI. Priya |
| Source | Raised in the unsigned T-522 relay (22 Oct 2026); the privacy@ concern itself comes from AJ-517-M15 (real Ajay). Ajay confirms the sweep before it is built. |

Every mail template prints `privacy@lawie.in`. AJ-517-M15 forbids that address unless the mailbox exists and is monitored; the signed address is `contact@lawie.in`. Sweep all templates and shared placeholders, replace with Ajay's signed address, add a test that fails on the old address. Ajay byte-checks.

## Ajay's ruling AJ-559-M1 (22 Oct 2026, from Ajay's own session)
The footer becomes "Help, data and privacy requests: contact@lawie.in" in 5 places; two body lines get the address swap only; a test catches `privacy@`. Ajay byte-checks at READY.
