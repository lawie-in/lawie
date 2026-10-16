# T-475: Act-section descriptions are cut at 120 characters before the model sees them

| Field  | Value                                                                   |
| ------ | ----------------------------------------------------------------------- |
| Status | To do. V1 (Anushka run 4 FAIL, 16 Oct 2026). Priya                       |
| Owner  | Mahak (found it), Ajay (signs the cap; goldens may move)                 |
| Mode   | Full chain (legal content path)                                          |

## Source

Mahak's diagnosis of why T-468's habeas citation did not reach Anushka's drafts: brief-drafter.ts actLines cuts every act-section description at 120 characters plus an ellipsis. Ajay's habeas text is 146 characters, so the model sees "...up to 7 years: S.35..." and never "(1)(b) BNSS [S.41(1)(b) CrPC]". 15 descriptions in 12 packs exceed 120.

## What

Raise or remove the cap so the model sees the full signed description. Check the 15 over-limit descriptions in 12 packs; any golden that moves goes to Ajay.

## Acceptance criteria

- A description longer than 120 characters reaches the model whole (test with the habeas text).
- The 15 affected descriptions listed in the merge body.
- Moved goldens go to Ajay; his ref in the merge body.

## Also (separate, Ajay)

Certiorari: system_role is an instruction to the model, not text printed in a draft, so "inferior tribunal or quasi-judicial authority" need not appear verbatim. Ajay says whether the printed draft must show it.
