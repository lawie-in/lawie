# T-245 — Criminal packs cite IPC/CrPC for offences before 1 July 2024

| Field          | Value |
| -------------- | ----- |
| Phase          | 1 — Describe and draft |
| Owner          | Ajay (writes and signs the switch text, per pack). Lead (build). Anushka (verdict) |
| Mode           | Rule first (Ajay), then build, full chain. Legal content |
| Status         | Ajay signed the text (handoff/legal/T-245-old-new-law-switch-signed.md, 345bd24). Built in two parts: T-245a (the bail packs, vishal after T-241), then T-245b (the remaining packs). The three wrong citations moved to T-248, which ships now |
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

## Ajay's rule and split (12 Oct 2026)

**The rule:**
- The offence law follows the offence date: IPC before 1 Jul 2024, BNS after.
- The procedure follows the FIR date:
  - FIR on or after 1 Jul 2024 → BNSS and BSA.
  - FIR before → the advocate chooses CrPC or BNSS (new key `procedure_code`).
- Never convert a section number, and never assume a date.

**The packs:**
- **A, offence and procedure (16):**
  - T-245a, the bail packs: bail_regular, bail_before_magistrate, bail_anticipatory, interim_bail, bail_cancellation, default_bail.
  - T-245b, the rest: surrender_application, suspension_of_sentence, criminal_appeal, criminal_revision, discharge_application, fir_quashing, quashing_528_bnss, writ_petition_criminal, review_petition (criminal), habeas_corpus.
- **B, offence only:** legal_notice_defamation, mact_claim.
- **C, procedure only:** maintenance_bnss_144, divorce_sma.
- **D, wording only:** affidavit_identity, memo_of_parties.
- B, C and D are built in T-245b.

The text is the shared S-text and P-text, exact. Each pack gets its own CrPC→BNSS pair, and `{governing_provision}` goes in the heading and the prayer.
