# T-637: The Templates form route skips the T-611 delivery gate

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (P0, release gate) |
| Owner  | vishal, straight after T-628 |
| Mode   | Full chain; legal (ai.service.ts, Ajay's T-611 policy) |
| Status | To do. Raised 27 Oct 2026 from Vishal's T-628 developer. Priya |

## Problem
POST /documents/generate-from-template (documents.routes.ts ~977-1050, streamGenerateFromTemplate) streams body text with only templateGuard. No T-611 gate runs: no held-fact fill, no repair, no withhold, and no fact_needed question. Anushka's regular-bail draft (26 Oct prod item 1) used this path.

## Acceptance criteria
1. The form route runs the same T-611 gate (P1-P7) as the brief path: code fill, one repair, then withhold with the signed question and no Ink.
2. The body does not stream to the user before the gate decides.
3. The editor and GET never show a raw {{MISSING}} from this path.
4. Tests on the form path, including Anushka's regular-bail inputs.
5. Ajay confirms the policy applies as-is, or reviews the form path.
6. Release gate: no prod cut without T-637.

## Scope widened (Arjun, 27 Oct 2026): the gate runs with no ledger
The delivery gate is a safety property. It runs on every draft, whatever the value of feature.fact_ledger. When no ledger exists, T-637 builds an in-memory ledger from the brief (brief path) or from the form answers (form route), then runs the same fill, repair and withhold.
- AC7: gate tests cover both branches, ledger present and in-memory.
- AC8: the gate is active with feature.fact_ledger off. A draft from Anushka's bail matter with the flag off never delivers a {{MISSING for a brief-held fact.
- feature.fact_ledger keeps controlling only the persisted per-user ledger (Phase 1).
- Ajay FR-6 is met by this; the release note still states the flag's value.
