# T-115 — Permanent delete, and encrypt saved case details

| Field      | Value                                 |
| ---------- | ------------------------------------- |
| Phase      | 4 — Polish and v1                     |
| Owner      | Vishal, Arjun on the design           |
| Mode       | Full chain                            |
| Status     | Needs a short design from Arjun first |
| Depends on | None                                  |
| Branch     | feature/t-115-delete-and-encrypt      |
| Created    | 2026-10-04                            |

## Goal

What the privacy policy promises about deletion and encryption is true in the code.

## Context

- Found in T-302. The policy says users may delete their documents and account, and that case details are encrypted at rest.
- Documents are only flagged `isDeleted`. No route removes a document or an account.
- A document's `formInputs` (party names, FIR numbers, the facts) are saved as plain values. Only `generatedContent` and `finalContent` go through `encrypt()` in `apps/drafting/src/utils/encryption.ts`.
- Whether Atlas encrypts storage on the production tier is not confirmed.

## Acceptance criteria

- A deleted document is removed for good within 30 days of the delete.
- A user can close their account. Their documents and inputs are removed for good within 30 days. Payment records are kept.
- `formInputs` are encrypted with the same method as the draft text, including existing rows, or Arjun confirms storage encryption and Ajay rewords the policy.
- Tests cover: a delete, the purge after 30 days, an account close, and reading an old document after its inputs are encrypted.

## In scope

- `apps/drafting`: document routes, the Document model, a purge job
- `apps/auth`: account close

## Out of scope

- Backups of deleted data (there are none on M0)

## References

- Design: Not needed
- ADR: Not needed
- Legal sign-off: Ajay, T-302, 4 Oct 2026
