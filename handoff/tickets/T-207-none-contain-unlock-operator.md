# T-207 — A `none_contain` test so `not_in` unlock conditions cannot fail open

| Field          | Value                                                                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase          | 1 — Describe and draft                                                                                                                        |
| Owner          | Ajay (the rule, signs both JSON files). Lead (build). Anushka (verdict)                                                                       |
| Mode           | Build, full chain, with legal content                                                                                                         |
| Status         | To do. Rule written by Ajay (T-147c sign-off, 10 Oct 2026). Build waits only for Ajay to sign the two JSON diffs                              |
| Size           | M (1 day), plus Ajay's sign-off time                                                                                                          |
| Depends on     | T-147c                                                                                                                                        |
| Gate           | Must land before the switch goes on in `bail_before_magistrate`, where occupation is a free-text question. Also before `feature.fact_ledger` for real users |
| Branch         | feature/t-207-none-contain-operator                                                                                                           |
| Legal sign-off | Needed. Ajay signs `apps/drafting/src/config/document-rules/_averments/bail_regular.json` and `_averments/maintenance_bnss_144.json` (hash-signed; any edit invalidates the sign-off). The `averments.ts` loader is code |
| Created        | 2026-10-11                                                                                                                                    |
| Source         | Ajay's T-147c sign-off, 10 Oct 2026 (his rule). Relayed by Vishal, 11 Oct 2026                                                                |

## Problem

An averment condition that uses `not_in` fails open. `not_in` only blocks an exact match. Example: if `applicant_occupation` is "unemployed since 2024", that still unlocks "gainfully employed".

## User

District court advocate whose client has no job. The draft must never say the client is gainfully employed.

## Solution (Ajay's exact rule)

1. Add a condition operator `none_contain`. It holds only if the fact is present and its folded display contains none of the listed folded terms as a whole word or phrase.
2. Add a loader check: any `not_in` that unlocks something must sit in an `all_of` together with a `none_contain`.
3. `bail_regular`: `gainfully_employed`, its `unlocked_by` and `requires`, become:

   ```json
   {"all_of":[{"key":"applicant_occupation","label":"Applicant occupation","not_in":[...current...]},{"key":"applicant_occupation","label":"Applicant occupation","none_contain":["unemployed","not employed","not working","no job","jobless","no work","without work","nil","none","berozgar","berojgar","bekaar","student","homemaker","housewife","house wife","retired","pensioner","kuch nahi","ghar par"]}]}
   ```

   Apply the same change to `gainfully_employed_with_employer`'s first condition, and to `maintenance_bnss_144.respondent_occupation`.
4. Add an allowed entry `occupation_stated`, with averment "the applicant's occupation is {{applicant_occupation}}" and `requires` `{key: applicant_occupation, present: true}`.

## Acceptance criteria

1. `none_contain` is a condition operator in `averments.ts`, validated by the loader. It holds only when the fact is present and its folded display contains none of the folded terms as a whole word or phrase.
2. The loader rejects any `not_in` that unlocks something unless it sits in an `all_of` with a `none_contain`. Every shipped pack loads after step 3.
3. `bail_regular.gainfully_employed` (`unlocked_by` and `requires`), the first condition of `gainfully_employed_with_employer`, and `maintenance_bnss_144.respondent_occupation` carry exactly the condition in step 3. The `not_in` list keeps its current values.
4. `occupation_stated` is an allowed entry in `bail_regular` exactly as in step 4.
5. Tests: "unemployed since 2024" keeps `gainfully_employed` banned. Each `none_contain` term keeps it banned. A real occupation (e.g. "vegetable vendor") unlocks it. A missing occupation keeps it banned. Whole-word matching: a term inside another word does not match (e.g. "nil" in "Nilesh").
6. Test: `occupation_stated` is allowed whenever `applicant_occupation` is present, and prints the ledger display value.
7. Ajay signs both JSON files. The report gives each file's SHA-256 from `yarn workspace @lawie/drafting report:averments`.
8. Golden snapshots unchanged. If one moves, stop and report. CI green on drafting.

## Out of scope

- Other `not_in` conditions in other packs, beyond what the step-2 loader check forces. If it flags more, stop and ask Ajay
- New averment text beyond `occupation_stated`

## References

- T-147c, `apps/drafting/src/services/averments.ts`, `.claude/docs/legal-content-paths.md`
