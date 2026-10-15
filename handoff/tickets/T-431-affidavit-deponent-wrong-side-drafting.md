# T-431: counter and rejoinder affidavit drafts may name the wrong deponent

| Field  | Value                                                                   |
| ------ | ----------------------------------------------------------------------- |
| Status | Assigned to Mahak, Explore 15 Oct 2026 (files to Priya). Priya |
| Owner  | Mahak (build), Ajay (side rule, T-381 Addendum 5 04c1630)               |
| Mode   | Small fix unless Explore finds more (legal content: party mapping)      |

## Problem

Found by Mahak during T-424 (14 Oct 2026); to confirm in Explore. On the drafting path, apps/drafting/src/services/template-engine.service.ts ~:1843 fills {deponent_name} from applicant_name for counter_affidavit and rejoinder_affidavit drafts, so the deponent can be the wrong side, the same issue T-424 fixes for the annexures Memo.

## Acceptance criteria

1. Confirm whether the drafting path names the wrong deponent on these two packs.
2. If it does: the deponent comes from the same resolver as T-424 (brief-party-fields.ts: client_role, then the signed row, then refuse), never from applicant_name first.
3. Tests for both packs, both sides. Ajay signs.
