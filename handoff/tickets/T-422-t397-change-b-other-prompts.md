# T-422: apply T-397 change B to the PACK, REPAIR and GUIDED prompts

| Field | Value |
|---|---|
| Status | Todo. Vishal, after T-397. From Ajay, 13 Oct 2026. Priya |
| Owner | Vishal (build), Ajay (signs byte-exact) |
| Mode | Small fix (legal content: drafter.prompts.ts) |

## Acceptance criteria
1. Ajay's signed T-397 change B ("…bailable or non-bailable, that an offence is complete, that a claim is within limitation,") is applied byte-exact to the PACK (rule 8), REPAIR (rule 6) and GUIDED (rule 5) prompts in apps/drafting/src/prompts/drafter.prompts.ts.
2. The sha pins are updated, and Ajay signs the diff.
3. Also, from T-397's reviewer: the comment at apps/drafting/src/services/fact-verifier.ts:31 still calls FACT_REPAIR "PROPOSED". Fix the comment only.
