# T-611: Raw {{MISSING: ...}} printed in drafts for facts the user gave and the brief showed as filled

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (severity P0; from the prod quality check of 26 Oct 2026) |
| Owner  | Vishal or Shashank (drafting); Ajay sees any wording change |
| Mode   | Full chain |
| Status | Building (Vishal), 26 Oct 2026. P0. Phase 0 of drafting v3. Priya |
| Source | handoff/quality/2026-10-26-prod-drafting-FAIL.md |

## Problem
Three of four prod drafts print raw {{MISSING: ...}}, including facts the brief showed as filled: amount in words (x3 in s.138), sale deed date (x4 in injunction), relief in the main suit, applicant address, in custody since (regular bail para 3), cheque date (s.138 para 6 contradicts para 10). The checks panel itself says the brief has the value and the draft does not use it. Quality report items 1, 3, 4.

## Acceptance criteria
1. Every field filled in the brief reaches the draft; none prints as {{MISSING: ...}}. A {{MISSING}} token is never shown to the user: an unfilled field prints the same '[To be confirmed: ...]' form with its label.
2. Root cause named: where the ledger value is dropped between brief and renderer (placeholder alias mismatch such as 'Amount in Words' vs the key, date fields, free-text relief).
3. Regression tests from the report's three matters (bail, s.138 notice, O.39 injunction).
4. Interacts with the parked T-488 (s.138 verifier mutates cheque date); Explore first.

## Files
Lead lists after Explore (drafting renderer / fact ledger to draft mapping). Claimed by Priya.

## Phase 0 delivery gate (Arjun, 26 Oct 2026; part of this ticket, not a patch)
5. A code delivery gate after the verifier: a draft that still holds `{{MISSING` for a fact the ledger holds is NOT delivered. One automatic repair from the brief/ledger; if still failing, ask the user the one missing thing. No Ink is debited for a failed or retried run (T-545/T-567 contracts). Raw `{{MISSING}}` tokens never reach the editor: the web shows `[To be confirmed: label]` everywhere, like the exports.
6. The fact verifier never blanks a value the ledger holds: judgeDate's cued-key `wrong_fact` and judgeAmount's `differs` become repair requests, not blanks, when the value equals a ledger fact; amounts in words are understood (normalised to the figure).
7. T-488 (s.138: the verifier mutates the cheque date; the State dropped) is folded in: same lead, same files.
8. Evidence first: read the prod FactDiff rows for Anushka's five drafts (via Arjun/Nikhil, read-only) to confirm which rule fired for each `{{MISSING}}` before changing the rules.
9. fact-verifier.ts and the drafter prompts are legal content: Ajay signs the changed violation policy.
