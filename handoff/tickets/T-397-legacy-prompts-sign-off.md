# T-397 — Ajay signs the legacy LEDGER, LEDGER_REPAIR and FACT_REPAIR prompts

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Ajay (review). Vishal applies any changes; he holds drafter.prompts.ts |
| Mode   | Legal review; then a small fix if Ajay lists changes |
| Status | Merged into develop_staging 7e23038 (Vishal, 13 Oct 2026). Ajay 05c7e44. Waiting for Anushka on develop. Priya |
| Source | Ajay, after signing the T-373 D1 prompt (f8d2102) |

## Why it matters for v1

After T-373, the legacy ledger path still drafts:
- the s.138 notice (v1);
- Hindi bail drafts (T-386, v1 stays on today's path);
- every pack without a signed skeleton.

So these prompts reach users.

## Acceptance criteria

1. Ajay reviews LEDGER, LEDGER_REPAIR and FACT_REPAIR in `apps/drafting/src/services/drafter.prompts.ts`. He either signs them as they are or lists changes.
2. If he lists changes, Vishal applies them byte-exact (after or within T-373, by Arjun's call), with a test pinning the signed text.
3. "PROPOSED" is removed from each prompt once it's signed.
