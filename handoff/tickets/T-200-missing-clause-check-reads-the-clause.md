# T-200 — The missing-clause check looks at the clause, not only its paragraph number

| Field          | Value                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Phase          | 1 — Describe and draft                                                                                                   |
| Owner          | Ajay (rule: what counts as present, signs). Lead (build). Anushka (verdict)                                              |
| Mode           | Rule first (Ajay), then build, full chain                                                                                |
| Status         | Assigned to vishal, 12 Oct 2026. Ajay's rule signed (56f9be4). Cues stay in code, not in bail_regular.json |
| Size           | Ajay S. Build M (1 day)                                                                                                  |
| Depends on     | T-136 (the check exists)                                                                                                 |
| Gate           | Before `feature.fact_ledger` for real users and before v1 go-live: a missing mandatory clause can pass as present        |
| Branch         | fix/t-200-missing-clause-check                                                                                           |
| Legal sign-off | Needed. `apps/drafting/src/services/brief-drafter.ts` is legal content (T-136 rules)                                     |
| Created        | 2026-10-11                                                                                                               |
| Source         | Finding from the T-147 build, 11 Oct 2026                                                                                |

## Problem

`findMissingClauses` (`brief-drafter.ts`) counts a mandatory clause as present when the Drafter reports it at paragraph N and paragraph N exists in the body. It does not check that paragraph N still holds the clause. After a repair pass, a fact-check removal or renumbering, the number survives while the clause is gone, and the check passes.

## User

Advocate who relies on Lawie to include every clause the law requires, e.g. the earlier-bail-applications disclosure.

## Solution

Ajay states what proves a clause is present (for example its fixed wording, or a cue from the pack). Code checks that in the reported paragraph.

## Acceptance criteria

1. Ajay writes the rule here and signs it: for clauses with `fixedText`, and for clauses without it.
2. A clause whose reported paragraph exists but no longer carries the clause is reported missing with a new reason (e.g. `clause_not_in_paragraph`).
3. Test: clause at paragraph 5, paragraph 5 replaced by other text → missing.
4. Test: renumbered body where the clause moved from 5 to 6 and the report says 5 → missing, then fixed by the repair pass.
5. Test: today's passing cases still pass. T-136 assertions unchanged; a fixture whose reported paragraph does not hold the clause is updated so the paragraph carries it (fixture text only, no assertion changed; Ajay sees each one in the signed diff). Reworded by Priya, 12 Oct 2026: the signed cues make the old 'every clause at paragraph 1' fixtures fail for the right reason.
6. No prompt text changes unless Ajay signs the diff.
7. Golden snapshots unchanged; if one moves, stop and report. CI green on drafting.

## Out of scope

- Clauses with `appliesWhen` (still not checked by code)
- The repair prompt

## References

- T-136, `handoff/design/T-136-drafter-rules-signed.md`

## Ajay sign-off (11 Oct 2026)

Read: this ticket; `apps/drafting/src/services/brief-drafter.ts` (`paragraphNumbers`, `hasFixedWording`, `findMissingClauses`); `rule-pack.service.ts` (`readClause`: `fixedText` is the clause's `content`); `intake-text.ts` (`normalise`); `bail_regular.json` `mandatoryClauses`; `handoff/design/T-136-drafter-rules-signed.md` (A rule 5, A2, B4). Nothing in code or packs changed.

Facts that shape the rule: no bail-family clause has `fixedText` today. Only the commercial packs do (`nda`, `moa`, `aoa`, `loan_agreement`, `employment_agreement`, `founders_agreement`, `franchise_agreement`, `service_agreement`, `shareholders_agreement`, `distribution_agreement`). So the clause this ticket was raised for (`earlier_applications`) needs the second rule.

### The rule: what proves a mandatory clause is present

Applies to every clause `findMissingClauses` checks today (required, no `appliesWhen`, reported at numbered paragraphs). SYSTEM, MISSING and no-report handling stay as they are. "The reported paragraphs" means the text of each paragraph number on the clause's line, from its number to the next numbered paragraph, read together in ascending order. All matching is on `normalise()` text.

**R0. Every reported paragraph exists.** As today. Otherwise `paragraph_not_found`.

**R1. Clauses with `fixedText`.**
1. Run the `hasFixedWording` stretch test (each stretch of 12 or more characters between blanks, in order) on the reported paragraphs only, not on the whole body.
2. Found there: present.
3. Not in the reported paragraphs but found, complete and in order, inside other paragraphs of the body: the code may re-point the clause to those paragraphs and count it present. The fixed wording identifies the clause on its own, and sending it to the repair pass would make the Drafter write it twice.
4. Not found anywhere in the body: `wording_not_found` (as today).
5. Found only in part, or split across paragraphs that were not reported: `clause_not_in_paragraph`.
6. If the fixed text gives no stretch of 12 or more characters, apply R2 instead. Today that is an automatic pass, and that must end.
7. If the draft language is not English, apply R2 instead and add a finding for the advocate: "Fixed wording of <clause title> not checked: the draft is not in English." All `fixedText` today is English.

**R2. Clauses without `fixedText`.** A clause is present only when one of these holds:
- **R2a (cues).** If the clause has `cues`, at least one reported paragraph carries them as defined below. If not: `clause_not_in_paragraph`. A cue proves the paragraph is about the clause, not that the clause is correct. The advocate is still responsible for that.
- **R2b (no cues: the paragraph has not changed).** When the clause is first counted present, the code records the text of its reported paragraphs, with paragraph numbers removed. At every later check (after a repair pass, a fact-check removal or a renumbering), the clause is present only if a reported paragraph still holds that recorded text word for word, numbers aside. If not: `clause_not_in_paragraph`. A clause the repair pass adds is recorded afresh from the repair's own report.
- A clause without cues, checked only once, passes on R0 as today. This is a known gap (see the residual risk below). Cues close it, pack by pack.

**R3. Re-pointing.** Only R1.3 may re-point a clause. A cue or a recorded text found in a paragraph that was not reported does not count as present: the clause goes to `clause_not_in_paragraph` and the repair pass. This is AC4's path.

### Cues for `bail_regular` (signed; to be added to the pack as a `cues` key on each clause)

Cue format: `any` is a list where one entry is enough. `all` is a list of `any` lists, and each of them must be met. Entries match as substrings of the normalised paragraph text. `{{key}}` means the brief's or ledger's value for that key as written in the brief, or its blank when the brief has none.

| Clause id | Cues |
|---|---|
| `fir_details` | any: `{{fir_number}}` |
| `custody_status` | any: `custody`, `arrest`, `jail`, `हिरासत`, `अभिरक्षा`, `गिरफ्तार`, `गिरफ़्तार`, `जेल` |
| `grounds` | any: `ground`, `submitted`, `आधार`, `निवेदन` |
| `no_flight_risk` (undertakings) | any: `undertak`, `वचन`, `आश्वासन` |
| `earlier_applications` | all: [any: `bail`, `जमानत`, `ज़मानत`], [any: `earlier`, `previous`, `prior`, `before`, `pending`, `rejected`, `dismissed`, `withdrawn`, `to be confirmed: whether any earlier bail application`, `पूर्व`, `पहले`, `लंबित`, `खारिज`, `ख़ारिज`, `निरस्त`, `अस्वीकृत`, `वापस`] |
| `prayer`, `verification`, `advocate_details` | none needed: these are system parts (`coveredBySystemPart`) |

- The `earlier_applications` cue deliberately does not accept the word "first" on its own. Under T-136 B4, the draft must not say "first application" unless the brief says so.
- The same cues apply to every pack whose `_averments` file inherits `bail_regular` (`bail_anticipatory`, `interim_bail`, `bail_before_magistrate`) when it has a clause with the same id. Other packs use R2b until I sign cues for them.
- Cues are legal content. Wherever they live (pack JSON preferred, or a constant in `brief-drafter.ts`), any edit needs my sign-off.

### Marks

| Item | Mark |
|---|---|
| R0 to R3 as the rule for AC1 | Approved |
| New reason `clause_not_in_paragraph` (AC2) | Approved |
| AC3 test: use a clause with cues or `fixedText`. Under R2b a single first check cannot see the replacement | Condition |
| AC4 test: use `earlier_applications` (cues, no re-pointing), so it goes missing and then to repair | Condition |
| Residual risk: R2b trusts the Drafter's first report, as today. Cues are a word test, not a check of meaning | Risk, accepted for v1 |
| Finding text in R1.7 | Approved as written |
| AC6: no prompt or repair-prompt change is needed for this rule | Acceptable |
| Overlap: putting cues in `bail_regular.json` touches the same file as T-190 and T-199. Run in sequence (`multi-lead.md` rule 1), or keep the cues in code | Note for Priya |

Signed: Ajay (CLO), 11 Oct 2026. R0 to R3 and the `bail_regular` cue table above, on the AC3 and AC4 test conditions. Any later change to the cues or to this rule needs a fresh sign-off.

## Ajay: cue mapping per pack (12 Oct 2026). Replaces the "same id" rule

Asked through Priya after vishal found `undertakings`, `fir_particulars` and `custody` getting no cues.

"Same id" is withdrawn because it fails both ways:
- The same id can mean different things. `no_flight_risk` in `interim_bail` and `bail_anticipatory` is not the `bail_regular` undertaking.
- Different ids can mean the same thing.

Cues now follow the clause's meaning, through an explicit `(pack, clauseId) → cueSet` map in code with no fallback by id. Anything not listed falls back to R2b. The cue sets are the 11 Oct `bail_regular` ones.

| Pack | Clause id | Cues | Mark |
|---|---|---|---|
| `bail_regular` | every row signed 11 Oct | unchanged | Approved |
| `bail_anticipatory` | `fir_details` | FIR cue: any `{{fir_number}}` | Approved |
| `bail_anticipatory` | `no_flight_risk` | none, R2b (the meaning differs) | Approved |
| `interim_bail` | `undertakings` | undertaking cue: any `undertak`, `वचन`, `आश्वासन` | Approved |
| `interim_bail` | `no_flight_risk` | none, R2b (the meaning differs) | Approved |
| `bail_before_magistrate` | `fir_particulars` | FIR cue: any `{{fir_number}}` | Approved |
| `bail_before_magistrate` | `custody` | custody cue: any `custody`, `arrest`, `jail`, `हिरासत`, `अभिरक्षा`, `गिरफ्तार`, `गिरफ़्तार`, `जेल` | Approved |
| `bail_before_magistrate` | `grounds` | grounds cue: any `ground`, `submitted`, `आधार`, `निवेदन` | Approved |
| `bail_before_magistrate` | `undertakings` | undertaking cue, as above | Approved |
| `interim_bail` | `urgency`, `main_application_reference`, `duration_sought` | none, R2b | Acceptable |
| `bail_before_magistrate` | `offence_classification`, `triple_test` | none, R2b | Acceptable |
| any of these packs | `prayer`, `verification`, `advocate_details` | system parts, no cues | n/a |

- AC4's `earlier_applications` test runs on `bail_regular` only.
- `ai.service.ts` call-site edits: Acceptable. Ajay signs that diff together with `brief-drafter.ts` before merge.
- AC5 rewording: Approved, on one condition. Only fixture body text changes. Reported paragraph numbers, clause ids and assertions stay as they are. List each changed fixture in the merge note. If any assertion has to change, stop and send it to Ajay.
- Risks outside this ticket: logged as T-237.
