# T-190 — Bail packs ask for the facts that unlock their averments

| Field          | Value                                                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Phase          | 1 — Describe and draft                                                                                                        |
| Owner          | Ajay (question text and order, signs). Vishal applies. Anushka (verdict)                                                      |
| Mode           | Legal content, then a small change through the dev lead                                                                       |
| Status         | Building: mahak, with T-199 (12 Oct 2026) |
| Size           | Ajay S (0.5 day for the question text). Vishal S (0.5 day to apply and test)                                                  |
| Depends on     | T-147c (the unlock keys exist). T-189 for any question that is a list or choice                                               |
| Gate           | Proposed (Priya): before `feature.fact_ledger` goes on for real users. Without it, a ledger bail draft omits most averments an advocate would expect. Arjun to confirm |
| Branch         | feature/t-190-bail-pack-unlock-questions                                                                                      |
| Legal sign-off | Needed. Legal content: `apps/drafting/src/config/document-rules/` (see `.claude/docs/legal-content-paths.md`)                 |
| Created        | 2026-10-10                                                                                                                    |
| Source         | Vishal and Ajay, T-147c follow-up, 10 Oct 2026                                                                                |

## Problem

T-147c allows an averment only when its unlock key is a ledger fact. `bail_regular` never asks for most of those keys, so most allowed averments can never unlock. They stay banned, and the draft is weaker than what the advocate would write by hand.

## User

District court advocate filing a bail application who has these facts and expects them in the draft.

## Solution

Add questions for the unlock keys to `bail_regular`, in Ajay's order. The bail-family packs that inherit from it follow the same order.

| #  | Key                                                    | Note                                                              |
| -- | ------------------------------------------------------ | ----------------------------------------------------------------- |
| 1  | `earlier_bail_applications`                            | Suppression risk; Kusha Duruka v. State of Odisha (SC, 2024)      |
| 2  | `antecedents`                                          |                                                                   |
| 3  | `arrest_date`                                          |                                                                   |
| 4  | `investigation_status`                                 |                                                                   |
| 5  | `applicant_sex`                                        |                                                                   |
| 6  | `medical_condition`                                    |                                                                   |
| 7  | `named_in_fir`                                         |                                                                   |
| 8  | `recovery_status`                                      |                                                                   |
| 9  | `cooperated_with_investigation`                        |                                                                   |
| 10 | `applicant_occupation`                                 |                                                                   |
| 11 | `local_ties`                                           |                                                                   |
| 12 | `s35_notice_status`                                    |                                                                   |
| 13 | the `co_accused_bail_*` keys and `co_accused_role_comparison` |                                                            |

## Acceptance criteria

1. Ajay writes the question text for each key and signs it in this file.
2. `bail_regular` asks the 13 groups above in that order.
3. Each bail-family pack that inherits from `bail_regular` asks them in the same order. Vishal lists those packs in the report.
4. Each answer becomes a ledger fact with `source: "asked"` and a `raw_span` from the answer (T-147b AC2 and AC3).
5. Test: with each key answered, the averment it unlocks is allowed and uses the ledger `display` value (T-147c AC4).
6. Test: with a key unanswered, its averment stays banned and does not appear in any phrasing.
7. The 10-question cap still applies. Items past it follow T-188.
8. `earlier_bail_applications` is never skipped when the cap is reached, because of the suppression risk. Ajay confirms how this sits with the cap.
9. Golden snapshots are run. Any change is read and approved by Ajay, never updated automatically.

## Out of scope

- Allowed texts for entries that have none (T-195)
- Default-bail and s.138 computed facts (T-191, T-192)
- Packs outside the bail family

## References

- T-147b, T-147c, T-188, T-189, ADR-022

## Arjun (11 Oct 2026)

**Call: gate confirmed as proposed.** T-190 blocks `feature.fact_ledger` going on for real users. This matches T-199, T-200 and T-207.

- Scope of the gate: real users only. The flag may be on for internal and staging accounts and for Anushka's runs, so T-190 can be tested before it lands.
- Not a v1 blocker on its own. It becomes one only if `feature.fact_ledger` is meant to be on at go-live (T-403). With the flag off, bail drafts use the path that does not use the ledger and are not affected.
- Why it blocks: averments that cannot unlock are fail-safe (no invented facts) but leave the draft weaker. On a bail application that is a product failure, not a safety one, and real users should not get it.

## Ajay sign-off (11 Oct 2026)

Read: this ticket; `bail_regular.json` (form items, `mandatoryClauses`, `promptInstructions`); `_averments/bail_regular.json` (every `unlocked_by` / `requires`) and `_averments/README.md` (`equals`, `not_in`, `present`); `intake-brief.ts` `buildQuestions` (cap = 5 a round x 2 rounds; party names first, then `alwaysAsk`, then the rest); T-188, T-189. Nothing in code, packs or snapshots changed. The `_averments` file needs no edit for anything below.

### How the answers must be taken (conditions on the text below)

1. **Labels** are the averment file's labels word for word. Matching is by key, but the advocate sees the same words in the brief and in the sign-off table.
2. **Answer forms** are built so that the answer the advocate is likely to give is one the `equals` / `not_in` list already accepts. Where I list choices, use them as the item's options once T-189 lands. Until then, show them as hint text after the question. A free answer outside the list does not unlock anything. That is fail-safe, but it costs the advocate the averment.
3. **Every choice question has "Not known".** "Not known" writes no fact. The averment stays banned and nothing is said either way.
4. **These items are optional.** Leaving one blank never blocks the draft and never prints a blank in the draft: the averment is simply not made. The one exception is `earlier_bail_applications`, whose mandatory clause keeps T-136 B4's blank.
5. **Blocker unless built: a "none" answer on a `present` key must write no fact.** For `medical_condition`, `local_ties`, `co_accused_bail_court` and `co_accused_bail_date`, the unlock is `present`. Today the answer "None" would be a non-empty fact and would print "the applicant suffers from None". The item must treat `none`, `nil`, `no`, `not applicable`, `n/a`, `nahi`, `koi nahi` and `kuch nahi` (case and punctuation folded) as empty. Test each of the four.
6. **Questions are neutral.** No question suggests the answer that helps the applicant. The wording below is to be copied as written. Reception may word a question more naturally (`wordedQuestions`) only for keys other than 1, 2 and 12. Those three always use my text, because their wording carries the legal point.

### Questions, in order (the order AC2 and AC3 use)

| # | Key | Label | Question (exact text) | Answer form |
|---|---|---|---|---|
| 1 | `earlier_bail_applications` | Earlier bail applications in this matter | Has any bail application (regular, anticipatory or interim) been made for the applicant in this case before, in any court, including the High Court? If yes, give for each: the court, the date of the order and the result (rejected, dismissed as withdrawn, granted and cancelled, or still pending). If none, write "None". | Free text. "None" unlocks `first_bail_application`. Anything else becomes the `earlier_bail_applications` averment |
| 2 | `antecedents` | Criminal antecedents | Is any other criminal case (FIR, charge sheet or conviction) pending or past against the applicant? If yes, give each case number, police station or court, sections and its status. If none, write "None". | Free text. "None" unlocks `no_criminal_antecedents` |
| 3 | `arrest_date` | Date of arrest | On what date was the applicant arrested? Give the date in the arrest memo, even if custody began on another date. | Date |
| 4 | `investigation_status` | Investigation status | What is the stage of the investigation? | Choices: Under investigation / Charge sheet filed / Cognizance taken / Not known |
| 5 | `applicant_sex` | Sex of the applicant | Sex of the applicant. | Choices: Male / Female / Transgender / Not given |
| 6 | `medical_condition` | Medical condition of the applicant | Does the applicant suffer from any illness, disability or medical condition you want placed before the court? If yes, name it as written in the medical papers. If not, leave it blank. | Free text (condition 5) |
| 7 | `named_in_fir` | Whether the applicant is named in the FIR | Is the applicant named in the FIR? | Choices: Yes / No / Not known |
| 8 | `recovery_status` | Recovery or seizure from the applicant | Has anything been recovered or seized from the applicant, or at the applicant's instance? If yes, say what. If nothing, write "None". | Free text. "None" or "No" unlocks `no_recovery` |
| 9 | `cooperated_with_investigation` | Whether the applicant has cooperated with the investigation | Has the applicant so far joined or cooperated with the investigation (for example, appeared when called or gave a statement)? | Choices: Yes / No / Not known |
| 10 | `applicant_occupation` | Applicant occupation | What does the applicant do for a living (for example: daily-wage labourer, farmer, driver, shopkeeper)? If nothing, write "Unemployed". | Free text |
| 10a | `sole_earning_member` | (T-199, signed there) | (T-199) | (T-199) |
| 11 | `local_ties` | Family and local ties of the applicant | What family or local ties does the applicant have at the address given (for example: lives there with parents, wife and children; owns the house; has lived there since birth)? If not known, leave it blank. | Free text (condition 5) |
| 12 | `s35_notice_status` | Notice under Section 35 BNSS | Before the arrest, was a notice of appearance under Section 35(3) of the BNSS served on the applicant? | Choices: Served / Not served / Not known. The option label must be "Not served": a bare "No" is not in the unlock list |
| 13a | `co_accused_bail_court` | Court that granted bail to the co-accused | Has any co-accused in this case been granted bail? If yes, which court granted it? If not, leave it blank. | Free text (condition 5) |
| 13b | `co_accused_bail_date` | Date of the co-accused's bail order | Date of that bail order. | Date (condition 5). Asked only when 13a has an answer |

**Drop `co_accused_role_comparison` from this ticket.** No entry in `_averments/bail_regular.json` reads that key (`parity_same_role` is banned with no unlock). Asking it would collect a fact the Drafter may not use. It belongs with T-195, which would add allowed text that I then sign. Group 13 is 13a and 13b only.

### Bail-family packs (AC3)

- `interim_bail` and `bail_before_magistrate`: the full order. Their `key_map` does not touch any of these keys.
- `bail_anticipatory`: same order, **but do not ask 3 (`arrest_date`), 8 (`recovery_status`) or 12 (`s35_notice_status`).** The applicant has not been arrested. Asking these invites the "illegal arrest" and "no recovery" averments in an application where they are false on their face. If the pack already holds an answer, it must not unlock those averments in this pack; Vishal reports how the inherited entries behave. 1, 2, 4 to 7, 9 to 11 and 13 stay.
- `default_bail` does not inherit (`inherits: null`), so it is out (T-191).

### AC8: `earlier_bail_applications` and the cap

- **It is asked in round 1, every time, unless the ledger already holds it as a fact** (read with a verbatim span, or answered). It ranks straight after the party names, ahead of the `alwaysAsk` items and every other question.
- **The cap stays 10.** It takes one of the 10 slots; it does not add an 11th. If that fills the cap, the lowest-ranked other question drops past the cap and follows T-188.
- **Stricter rule for "none" read from the description.** If the ledger value is in the "none" list (the value that unlocks "no other bail application has been made"), and its source is the description rather than an answer, it is still asked once, in the same slot, to confirm. That averment is the one with the suppression risk: Kusha Duruka v. State of Odisha, SC, 19 Jan 2024, 2024 INSC 46 (from knowledge, citation not looked up today; to be verified before it is quoted anywhere external). This overrides T-139 for this one key only.
- **Not answered:** no fact. The mandatory clause `earlier_applications` prints T-136 B4's blank, never "first application".
- **Order relative to the pack's required items:** 1 as above. Items 2 to 13 rank after every required item of the pack, in the order in the table. Past the cap they follow T-188. Until T-188 is decided (Arjun and me, still open), a past-cap item must write no fact. Add a test for it.

### Marks

| Item | Mark |
|---|---|
| Question text, labels and order above (AC1, AC2) | Approved |
| Condition 5, "none" on a `present` key writes no fact | Blocker until built and tested |
| Removing `co_accused_role_comparison` from scope | Approved (pushback on the ticket's group 13) |
| Anticipatory exclusions (3, 8, 12) | Condition |
| AC8 as above | Approved |
| Free-text answers missing the `equals` lists until T-189 | Risk, fail-safe, accepted |
| `antecedents` answered with cases: no allowed text states them, yet several High Courts expect criminal history to be disclosed in a bail application (from knowledge, not verified today) | Risk. Needs a T-195 entry with my text. Not a T-190 blocker |
| `medical_condition` is health data (DPDP): kept only as long as the brief, under T-187 retention | Acceptable |
| `dependants`, `false_implication_reason` and `employer_name` unlock averments but are not asked anywhere | Note for Priya: `dependants` fits with T-199 |
| Golden snapshot changes (AC9): I read them before approval, never auto-updated | Condition |

Signed: Ajay (CLO), 11 Oct 2026. The questions, labels, answer forms and order above, AC8 as written, on conditions 1 to 6 and the anticipatory exclusions. Any change to a question's wording (other than Reception's wording of keys outside 1, 2 and 12) or to the order needs a fresh sign-off.

## Arjun (12 Oct 2026): mechanism for T-190 + T-199 (Mahak's plan), approved with four conditions

Plan 1-5 approved (pack `question` + `ask_when_empty`, a tier after required items in pack order, protected slot for `earlier_bail_applications`, "Not known"/none writes no fact, `confirm: true` re-ask). Conditions:
1. **Bypass by origin, not by length.** A question skips `cleanQuestion`'s 240-character limit only when it carries `source: 'pack'` set by `rule-pack.service` from the signed file. Model text keeps the limit whatever its length. Pack question text is legal content: Ajay signs the exact bytes.
2. **Required items never drop.** The protected slot counts inside the cap of 10. Test over every current bail pack: required items + the protected slot ≤ 10, so no required item is pushed past the cap; if a future pack breaks that, the test fails rather than silently dropping a required question.
3. **"Not known" is remembered.** It writes no fact, but the item is marked asked for that draft so it is not asked again on the next pass (no loop). It is asked again only through the `confirm` path in step 5.
4. Past-cap items write no fact: keep the test you planned.
No new dependency, no migration, no `_averments` change: agreed.

Addendum (Arjun, 12 Oct 2026): **condition 2 replaced.** Mahak showed every bail pack already has more than 10 askable required items on an empty description (11, 11, 13, 16), so "no required item past the cap" never held. The cap stays 10 (Ajay's AC8). Condition 2 is now Mahak's (a)-(c): (a) the protected slot displaces only the lowest-ranked item, never a party name or an `alwaysAsk` key; (b) with the typical-description fixture, required-empty + protected ≤ 10 for each bail pack; (c) items past the cap write no fact and stay as visible blanks in the brief (T-188 behaviour, unchanged).
