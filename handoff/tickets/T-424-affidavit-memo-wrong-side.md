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

## Arjun (14 Oct 2026): scope

Same rule as T-381, one resolver: the annexure Memo and the affidavit take the parties from `brief-party-fields.ts` (client_role if answered, else the pack's signed row, else refuse with the T-381 422), never from the flat applicant/petitioner/respondent keys first. counter_affidavit and rejoinder_affidavit need their rows in the signed table if missing — Ajay adds them, same addendum format as T-381 Addendum 3. The fix is in the Memo/affidavit read path only; brief sealing is unchanged. Test: a counter_affidavit brief where the client is the respondent prints the respondent as deponent, and the T-381 table test covers the two new rows. Small fix after Ajay's rows; lead: whoever holds `brief-party-fields.ts` (Mahak, T-381) or the next free.
