# T-171 — High Court drafts use the High Court's own rule, never Patna's by default

| Field          | Value |
| -------------- | ----- |
| Phase          | 1 — Describe and draft |
| Owner          | Vishal (build), Ajay (signs strings and golden diff), Anushka (tests develop after merge) |
| Mode           | Fix, full chain (developer + tester + reviewer + Ajay). Legal content. Merge to develop per founder's 8 Oct rule |
| Status         | Building |
| Size           | M (1–2 days) |
| Depends on     | None. Cut from origin/develop (cb3bda5) |
| Branch         | fix/t-171-high-court-fallback |
| Legal sign-off | AJ-2026-10-08-T171-A1 (`scratchpad/ajay-signoff-2026-10-08.md`, last section). Approved on conditions; the four `high_court_generic.json` strings below are signed word for word. Any other change under a legal-content path, and any golden snapshot that changes: BLOCKED for Ajay, with the exact diff |
| Created        | 2026-10-08 |
| Source         | AJ-2026-10-08-T171-A1 |

## Problem

`resolveCourtRule` (`services/prompt-assembler.ts` ~L140–170) only recognises "patna". Every other High Court falls to `typeMapping.high_court = 'patna_hc'`. So a draft for the Allahabad, Delhi or Jharkhand High Court (three of our four launch states) and every other HC gets Patna High Court's formatting rules, although `allahabad_hc.json`, `delhi_hc.json`, `jharkhand_hc.json` and `high_court_generic.json` exist and `indian-courts.json` already names the right rule for each court in `formattingRulesRef`. Wrong court's case nomenclature, cause title and local rules in a filed petition.

## User

Advocate in UP, Delhi or Jharkhand (or any non-Bihar state) drafting for a High Court.

## Solution

1. Route by `formattingRulesRef`. If the court name matches an `indian-courts.json` entry, load that entry's `formattingRulesRef`. If nothing matches, load `high_court_generic`. Never fall back to `patna_hc`. `patna_hc` is reached only through a matching Patna entry.
2. Court name. The heading prints the court name exactly as the user entered it. If none was entered: `IN THE HIGH COURT OF __________`. Never infer a seat or bench.
3. Make the four signed string fixes in `high_court_generic.json` before it becomes the fallback (below).

## Acceptance criteria

1. No `'patna_hc'` remains as a default or type-mapping value in `prompt-assembler.ts` (grep in the report).
2. Blocker cases (each its own test, `resolveCourtRule('high_court', <name>)`):
   - "High Court of Judicature at Allahabad" and "…, Lucknow Bench" → `allahabad_hc`
   - "Delhi High Court" → `delhi_hc`
   - "Jharkhand High Court, Ranchi" → `jharkhand_hc`
   - "High Court of Judicature at Patna" and "Patna High Court" → `patna_hc` (no regression; existing test at `prompt-assembler.test.ts:86` stays green)
   - "Rajasthan High Court, Jaipur Bench" → `high_court_generic` (via its `formattingRulesRef`)
   - An unknown name ("High Court of Atlantis") and an empty name → `high_court_generic`, never `patna_hc`
3. Matching is on the court entry, not on loose substrings of the user's text. Report the match method used and one case it does not match.
4. Heading: for "Rajasthan High Court, Jaipur Bench" the draft prints the user's name verbatim (no seat or bench added); with no name it prints `IN THE HIGH COURT OF __________`. Paste both exact heading lines in the report for Ajay.
5. `high_court_generic.json` changes, character for character:
   - `localRules[0]` = `All petitions must be filed through an advocate enrolled with a State Bar Council, or by the party in person.`
   - `localRules[5]` = `Follow the High Court's current e-filing directions.`
   - `e_filing_mandatory` = `false` and `eFilingMandatory` = `false`
   - every `case_nomenclature` value = `_____ No. _____ of {year}`
   - `party_designation.state` = `State of __________`
   A test pins each of these strings.
6. Golden snapshots: `high_court_generic` is not in the golden set today, so `court-rules-golden` is expected to pass unchanged. If any snapshot changes, do not update it: stop and send the snapshot diff to Ajay. Tester never auto-updates.
7. Full drafting suite green; report counts. `@lawie/shared` built first.

## Out of scope

- `prompt-assembler.ts:163` sending `family_court` to `district_court_generic` (separate ticket, T-174).
- The 17 HC entries in `indian-courts.json` whose `formattingRulesRef` is `district_court_generic` (Andhra Pradesh, Himachal, J&K, Uttarakhand, Chhattisgarh, Orissa, Gauhati and benches, Sikkim, Tripura, Manipur, Meghalaya, Karnataka Dharwad/Kalaburagi). That data fix is T-155. See open question below.
- Adding `high_court_generic` to the golden set.
- Any change to `patna_hc.json`, `allahabad_hc.json`, `delhi_hc.json`, `jharkhand_hc.json`.

## What Ajay must sign

- Nothing new for items 1–5 if built exactly as AJ-2026-10-08-T171-A1.
- **Open question for Ajay before merge:** rule 1 says "use its `formattingRulesRef`". For the 17 HCs above, that ref is `district_court_generic`, so a literal build sends them to a district-court rule. Option proposed by Priya: on the `high_court` path, use the matched ref only if that rule's `courtType` is `high_court`; otherwise use `high_court_generic`. Developer builds this guard behind one function so it can be dropped; Ajay confirms or refuses it in the PR. None of the 17 is a launch state, so this does not block the launch-state fix.
- The two heading lines from AC 4.
- Any golden diff (AC 6).
- PR body cites AJ-2026-10-08-T171-A1. Anushka's packet: one HC draft each for Allahabad, Delhi, Jharkhand and Patna, and one for an unlisted HC.

## Files (expected)

`apps/drafting/src/services/prompt-assembler.ts` (~L140–170), `apps/drafting/src/config/court-rules/high_court_generic.json`, `apps/drafting/src/__tests__/prompt-assembler.test.ts` (or a new `t171-*.test.ts`). Reads `config/courts/indian-courts.json`; does not edit it. T-158 edits other court-rule files and `t157-state-line-and-court-lines.test.ts`; no expected overlap.
