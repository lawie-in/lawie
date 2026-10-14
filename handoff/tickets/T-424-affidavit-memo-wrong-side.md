# T-424: counter and rejoinder affidavit Memo can print the petitioner as the applicant

| Field  | Value                                                         |
| ------ | ------------------------------------------------------------- |
| Status | Todo. Unassigned; Arjun and Ajay to scope. Priya, 14 Oct 2026 |
| Owner  | Arjun (scope), Ajay (party-side rule), drafting lead (build)  |
| Mode   | Full chain (legal content: party mapping)                     |

## Problem

Found by T-396's reviewer (Kunal, 14 Oct 2026); predates T-396. On counter_affidavit and rejoinder_affidavit brief drafts, the annexures pack reads the flat party keys (applicant/petitioner/respondent) before the pack's client-role field, so the Memo of Parties can print the petitioner as the applicant, putting the client on the wrong side.

## Acceptance criteria

1. On counter_affidavit and rejoinder_affidavit brief drafts, the Memo of Parties takes the client's side from the client-role field (brief-party-fields.ts) before any flat key.
2. Where the side cannot be told, the pack refuses with the T-381 party_details_missing response; it never guesses.
3. Ajay signs the side rule for these two packs; a test pins both packs on both sides.
