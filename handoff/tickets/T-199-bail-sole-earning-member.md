# T-199 — `bail_regular` asks `sole_earning_member`, so "sole breadwinner" can unlock

| Field          | Value                                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Phase          | 1 — Describe and draft                                                                                                      |
| Owner          | Ajay (question text, signs). Lead applies. Anushka (verdict)                                                                |
| Mode           | Legal content, then a small change through the lead                                                                         |
| Status         | Merged into develop_staging 65d8707, with T-190 (12 Oct 2026). Anushka tests on develop |
| Size           | Ajay XS. Build S (0.5 day); XS if folded into T-190                                                                         |
| Depends on     | T-147c (the unlock key exists)                                                                                              |
| Gate           | Ajay rates it high. Same gate as T-190: before `feature.fact_ledger` for real users                                         |
| Branch         | fix/t-199-bail-sole-earning-member                                                                                          |
| Legal sign-off | Needed. `apps/drafting/src/config/document-rules/bail_regular.json` and `_averments/bail_regular.json`                      |
| Created        | 2026-10-11                                                                                                                  |
| Source         | Finding from the T-147 build, 11 Oct 2026. Ajay: high                                                                       |

## Problem

`_averments/bail_regular.json` bans `sole_breadwinner` unless the ledger has `sole_earning_member` equal to yes. `bail_regular.json` has no item with that key and T-190's 13 groups do not include it. So the averment can never unlock, even when the advocate says his client is the only earning member. It is one of the most common bail grounds in district courts.

## User

Advocate filing regular bail for a daily-wage client whose family depends on him alone.

## Solution

Add `sole_earning_member` as an item in `bail_regular` with Ajay's question, so it can be read from the description or asked.

## Acceptance criteria

1. Ajay writes the label, the question and its place in the T-190 order, and signs it here.
2. The item exists in `bail_regular.json` with key `sole_earning_member`. Bail-family packs that inherit it are listed in the report.
3. Test: description says "ghar ka akela kamane wala" → ledger fact with a verbatim span → `sole_breadwinner` allowed.
4. Test: not given → averment stays banned and no phrase from its list appears.
5. The `_averments` file's hash is not changed (no edit there). If an edit is needed, stop: it invalidates Ajay's sign-off.
6. Golden snapshots run; any change approved by Ajay.
7. CI green on drafting.

## Out of scope

- The other unlock keys (T-190)
- Choice-type handling of yes/no (T-189)

## References

- T-147c, T-190, T-189

## Ajay sign-off (11 Oct 2026)

Read: this ticket; `_averments/bail_regular.json` (`sole_breadwinner`: `sole_earning_member` equals `yes` / `haan` / `ha` / `true`; `family_dependent_on_applicant`: `dependants` present); `bail_regular.json`; T-190 (my sign-off of today). Nothing in code, packs or snapshots changed. No edit to the `_averments` file is needed (AC5 holds).

| Field | Text |
|---|---|
| Key | `sole_earning_member` |
| Label | Whether the applicant is the only earning member of the family |
| Question (exact text) | Is the applicant the only earning member of the family? |
| Answer form | Choices: Yes / No / Not known. Store "Yes" with the value `yes`. "Not known" writes no fact. Until T-189 lands, show the choices as hint text |
| Place in the T-190 order | **10a**: straight after 10 `applicant_occupation`, before 11 `local_ties`. Items 2 to 13 rank after the pack's required items (T-190 AC8), so it is the 11th of the 15 T-190 questions (1 to 13b, with 10a) |
| Bail-family packs | Asked in `bail_regular`, `interim_bail`, `bail_before_magistrate` and `bail_anticipatory` (relevant in all four) |

Conditions:
1. **Read from the description (AC3).** "ghar ka akela kamane wala" (or "only earning member", "akela kamane wala", "sole breadwinner") must be stored with the value `yes` and the advocate's words as the verbatim `raw_span`. If the extractor stores the words themselves as the value, the `equals` test fails and the averment stays banned. Vishal confirms which happens; if it needs T-189's choice handling, say so and do not edit the `_averments` list.
2. **"No" or "Not known"** writes no unlock. The test for AC4 checks that no phrase of `sole_breadwinner` appears.
3. **The question stays neutral,** as written. Do not reword it to "Is the family dependent on the applicant?", which is a different averment (`family_dependent_on_applicant`).

Recommended, not a condition: `dependants` (key exists; it unlocks "{{dependants}} depend on the applicant") is the natural follow-on and is asked nowhere. If Priya adds it to this ticket, it is **10b**, label "Who depends on the applicant", question: "Who in the family depends on the applicant's income (for example: aged mother, wife, two minor children)? If not known, leave it blank." Free text, with T-190 condition 5 (a "none" answer writes no fact). I sign that text too, but only for use if it is put in scope.

Mark: Approved (high, as before: one of the commonest bail grounds in district courts).

Signed: Ajay (CLO), 11 Oct 2026. The label, question, answer form and place 10a above, on conditions 1 to 3; the 10b text only if it is added to scope.
