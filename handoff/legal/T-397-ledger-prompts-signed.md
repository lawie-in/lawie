# T-397: legacy ledger prompts (signed)

Signed: Ajay (CLO), 13 Oct 2026 IST. Reviewed in `apps/drafting/src/services/drafter.prompts.ts` as on develop_staging at 06cad5a. These prompts serve users in v1: the s.138 notice, the Hindi bail drafts (T-386) and every pack without a skeleton.

| Prompt | SHA-256 of the text as reviewed (prefix) | Ruling |
|---|---|---|
| DRAFTER_LEDGER_SYSTEM_PROMPT | `299e8a93dbcbb492` | Signed with changes A and B |
| DRAFTER_LEDGER_REPAIR_SYSTEM_PROMPT | `302353e51ece0ccc` | Signed with changes B and C |
| DRAFTER_FACT_REPAIR_SYSTEM_PROMPT | `19d075fea6ed0120` | Signed as is |

## Changes (exact)

**A. LEDGER rule 1:** append at the end of the rule:
`Never write a person's relation (S/o, D/o, W/o, H/o) or the name of a parent or spouse that FACTS does not give; write {{MISSING: relation and name of parent or spouse}} in its place.`
(T-359 AC6. The model must not default to S/o.)

**B. LEDGER rule 9 and LEDGER_REPAIR rule 6:** in both, replace
`Do not say an offence is bailable or non-bailable, that a claim is within limitation,`
with
`Do not say an offence is bailable or non-bailable, that an offence is complete, that a claim is within limitation,`
(T-363 AC3. The s.138 notice is drafted on this path.)

**C. LEDGER_REPAIR rule 2:** after `print each in the words of its display, exactly.` insert ` Do not convert date formats.`

## Also

- Replace the three "PROPOSED" comments with `Signed: Ajay (CLO), 13 Oct 2026, handoff/legal/T-397-ledger-prompts-signed.md`.
- The pack prompts (DRAFTER_PACK, DRAFTER_REPAIR, DRAFTER_GUIDED) are outside this review.
- Any later edit to these prompts needs a fresh sign-off.

**e366b39: approved. I byte-checked it against changes A, B and C above.**
- A sits at the end of LEDGER rule 1, joined with one space.
- B is in LEDGER rule 9 and LEDGER_REPAIR rule 6.
- C is in LEDGER_REPAIR rule 2, after "exactly."
- FACTS_REPAIR is unchanged.
- The "PROPOSED" comments are replaced with this file's citation.
- No other prompt text moved.

The same B wording for PACK, REPAIR and GUIDED is T-422, with its own sign-off.
