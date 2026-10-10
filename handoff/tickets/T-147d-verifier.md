# T-147d — Every draft is checked against the ledger before the advocate sees it

| Field          | Value                                                                                                                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Phase          | 1 — Describe and draft                                                                                                                                                                                                               |
| Owner          | Vishal (build), Anushka (tests on develop)                                                                                                                                                                                           |
| Mode           | Build, full chain. Merge to develop. **This is the go-live gate for T-147**                                                                                                                                                          |
| Status         | Blocked on T-147c                                                                                                                                                                                                                    |
| Size           | M (1 day)                                                                                                                                                                                                                            |
| Depends on     | T-147c (the Drafter is on the ledger contract)                                                                                                                                                                                       |
| Branch         | feat/t-147d-verifier                                                                                                                                                                                                                 |
| Legal sign-off | Not needed for the checks themselves (pure code, no legal content). BLOCKED for Ajay if the placeholder or banner wording lands in a legal-content path. The fact-diff log format is his — ADR-022 makes weekly review his condition |
| Created        | 2026-10-09                                                                                                                                                                                                                           |
| Source         | ADR-022 section 2C. Parent: T-147                                                                                                                                                                                                    |

## Problem

The existing rule checks ask structural questions — is a section cited, is the prayer present. They passed a draft that invented four averments, dropped two facts and changed three. Fact fidelity is a different class of check and it does not exist.

## User

District court advocate who is going to file what comes out. A visible blank costs him thirty seconds; a wrong police station costs him a defective filing.

## Solution

A verifier that runs in code on every draft, after the code-assembled sections and before the advocate sees anything. No LLM call in the checks themselves.

Four checks:

1. **Unsupported entity.** Every number, amount, date, proper noun, police station, court name, case number and section ref in the draft must match a ledger `value` or `display`, or the pack's static allowlist (statutory text, standard prayer language, court-format boilerplate). Anything else is flagged.
2. **Dropped fact.** Every fact flagged `required_in_draft` must appear. Normalized comparison, so `Rs 3,00,000` satisfies `value: 300000`.
3. **Mutation.** Dates, amounts and names must be character-exact after normalization. This is the check that catches the memo date and the bank branch: present, plausible, wrong.
4. **Banned phrase.** Any banned assertion without its backing ledger fact is stripped and replaced with `{{MISSING: label}}`. We do not leave an unbacked averment in the document for the advocate to maybe notice.

On failure: **one** targeted repair pass — the offending paragraphs only, with the violations and the ledger, not the whole document — then re-verify. If it still fails, ship with visible placeholders and a banner naming what needs attention. No second loop, no silent pass-through.

## Acceptance criteria

1. All four checks run on every draft. A draft that passes is unchanged by the verifier.
2. **The T-147 draft fails this verifier.** Replay Anushka's run-2 output against her ledger: the four invented averments are caught by check 4, the Rs 3 lakh and the police station by check 2, the memo date and the bank branch by check 3. This is the ticket's headline test — if the verifier passes that draft, the ticket is not done.
3. Statutory text, standard prayer language and court boilerplate from the pack's static allowlist do **not** trip check 1. The pack allowlist is the mechanism; it is tuned against fixtures, never in production.
4. The repair pass sends only the offending paragraphs, with the specific violations. It runs at most once per draft.
5. A draft that still fails after repair is delivered with `{{MISSING: ...}}` visible and a banner listing what needs the advocate's attention. It is never delivered with a wrong value in place of a placeholder, and it is never silently passed.
6. Every failure and every repair writes a fact-diff record — ledger value, draft value, resolution, rule pack, `runId` — queryable for Ajay's weekly review.
7. Placeholder rate per rule pack is recorded, so a spike reads as an allowlist gap rather than a model regression.
8. The existing rule checks (`validator.ts`, `post-processor.ts`, `bail-guard.ts`, `citation-check.ts`) keep running and keep their current behaviour. The verifier is additive.
9. Golden snapshots unchanged. CI green on all four services.

## Out of scope

- Fixtures and real-model runs: T-147e. This ticket's tests may use recorded output, including Anushka's run-2 draft as a saved artefact.
- The placeholder UX wording on the draft screen (ADR-022 open question 1 — Priya scopes, Madhuri words). Use a plain functional string and flag it in the report.
- Allowing a second repair pass (ADR-022 open question 3). One pass, revisit after golden-set numbers.
- Any LLM-as-judge check. ADR-022 section 5.3 rejected it.
- Fixing the faults the verifier exposes in other packs. Those become their own tickets.

## What Ajay must sign

Nothing for the checks themselves. He owns the fact-diff log format and retention (ADR-022 open question 4) and his weekly review of it is a recorded condition — agree the format with him while this is in build. If the placeholder or banner string lands in a legal-content path, that diff is a gate.

## Files (expected)

New: `apps/drafting/src/services/fact-verifier.ts`, `apps/drafting/src/services/fact-diff-log.ts`, `apps/drafting/src/__tests__/t147d-verifier.test.ts`, a saved copy of Anushka's run-2 draft and ledger as a test artefact. Touched: `apps/drafting/src/services/brief-drafter.ts` (call the verifier), `post-processor.ts`, the draft-delivery route. Read-only: `validator.ts`, `bail-guard.ts`, `citation-check.ts`.
