# T-245 — Criminal packs cite IPC/CrPC for offences before 1 July 2024

| Field          | Value |
| -------------- | ----- |
| Phase          | 1 — Describe and draft |
| Owner          | Ajay (writes and signs the switch text, per pack). Lead (build). Anushka (verdict) |
| Mode           | Rule first (Ajay), then build, full chain. Legal content |
| Status         | To do. Waits for Ajay's text. Raised by Ajay, 12 Oct 2026 |
| Gate           | Blocker for v1 go-live (legal accuracy) |
| Depends on     | T-237 and T-241 (same bail packs: run in sequence) |

## Problem

The criminal packs tell the Drafter "NEVER use old IPC section numbers". This affects `bail_regular`, `bail_anticipatory`, `interim_bail` and `bail_before_magistrate`, and probably also `fir_quashing`, `criminal_appeal`, `criminal_revision`, `discharge_application` and the others.

That's wrong for an offence committed before 1 July 2024:
- the offence stays under IPC;
- pending proceedings continue under CrPC (BNSS s.531 savings).

Drafts for those cases cite the wrong law.

## Acceptance criteria

1. Every criminal pack asks for `offence_date` (and the FIR/proceeding date where it matters). Ajay lists which packs.
2. Ajay signs, for each pack, which law applies to the offence and which to the procedure, with the text.
3. The Drafter cites IPC/CrPC or BNS/BNSS to match the switch. `config/sections/` maps both ways.
4. Tests, for each pack:
   - offence date 2023 → IPC cited;
   - 2025 → BNS;
   - no date → `{{MISSING}}`, and no law is assumed.
5. Moved golden snapshots are listed for Ajay. CI green on drafting.
6. The T-239 batch 1 criminal specs use the same switch.
