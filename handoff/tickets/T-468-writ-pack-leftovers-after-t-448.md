# T-468: Writ packs: three leftover wording fixes after T-448

| Field  | Value                                                                    |
| ------ | ------------------------------------------------------------------------ |
| Status | To do. V1. Mahak (she knows the writ packs). Priya, 15 Oct 2026          |
| Owner  | Lead (build), Ajay (byte-checks the diff)                                |
| Mode   | Full chain (legal content under apps/drafting/src/config/document-rules/) |

## Source

Mahak found these while building T-448 (merged ee260ae). Ajay ruled on all three, 15 Oct 2026, T-245 file 65a9fe1a. The exact replacement text is in that file; copy it, do not reword.

## What changes

1. **Habeas corpus, line about :303.** Replace with `S.35(1)(b) BNSS [S.41(1)(b) CrPC]`. The judgment name is dropped.
2. **Mandamus validation rule.** Replace the "MUST cite ..." rule with the four conditions in plain words. No "MUST cite", no judgment name.
3. **Certiorari opening line.** Say "inferior tribunal or quasi-judicial authority". The word "court" is dropped.

Also (Ajay, same ruling): the golden-set verifier list may be extended only with sections that appear in that pack's signed text or in the signed tables (bns-offences, T-245 pairs, T-361). No general whitelist; anything else stays flagged and goes to Ajay.

## Acceptance criteria

- The three lines match Ajay's text byte for byte.
- No judgment name is left in the changed packs' model-visible text (Mahak's T-448 test still green).
- Tests pin the three changes.
- Ajay's ref in the merge body.

## Out of scope

Other packs; the verifier list (separate, only if Vishal's golden work needs it).
