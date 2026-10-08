# T-153 — Magistrate bail records custody and the jail

| Field          | Value |
| -------------- | ----- |
| Phase          | 1 — Describe and draft. MUST FIX before go-live |
| Owner          | Vishal (build), Ajay (sign-off), Anushka (tests develop after the batch) |
| Mode           | Fix, full chain. Merge to develop per founder's 8 Oct rule (as relayed by Vishal); Anushka tests the batch on develop |
| Status         | Merged to develop (PR #63), 8 Oct. Anushka tests on develop. |
| Size           | M (1–2 days) |
| Depends on     | T-146, T-150 (both merged) |
| Branch         | fix/t-153-magistrate-bail-custody-and-jail |
| Legal sign-off | NEEDED. BLOCKED for Ajay until he signs the exact diff (see below) |
| Created        | 2026-10-08 |
| Source         | T-146 criterion 1 (jail part not met); T-150 note (`bail-guard.ts` line ~142: "bail_before_magistrate has no custody choice yet, so Rule B does not fire on it") |

## Goal

A bail application before a Magistrate asks whether the client is in custody and in which jail, prints the jail in the verification when in judicial custody, and gets T-150's Rule B warning when the client is not in custody.

## Known state (Priya, from a read of develop 6e3afba, not reproduced)

- `bail_before_magistrate.json` has `days_in_custody` but no custody-status choice and no jail field. Its verification already uses `{custody_clause}`.
- `template-engine.service.ts`: `{custody_clause}` prints only when `currently_in_custody` / `in_custody` / `custody_status` says judicial custody; `{jail}` reads `jail`, `jail_name`, `place_of_custody`, ... — so the engine side likely needs no change.
- `bail-guard.ts` Rule B skips this document because it has no custody choice.

## Acceptance criteria

1. The Magistrate bail rule pack has a custody-status choice with the same option ids and wording as `default_bail`'s (incl. "No — anticipating arrest") and a jail-name field shown only when custody is judicial.
2. Anushka's T-146 scenario (CJM Court, Patna; name, father, age, "Beur Jail, Patna" given; judicial custody), stubbed model: verification reads "..., currently in judicial custody at Beur Jail, Patna, do hereby verify ...".
3. Same scenario with police custody or not in custody: no custody clause, no "[To be confirmed: name of jail]" blank, and the jail is not asked.
4. Custody "No — anticipating arrest" or not given on a Magistrate bail: T-150 Rule B warning shows, same text as regular bail; the brief can still be confirmed (warning, not a block).
5. If the description already says the jail or custody ("lodged in Beur Jail"), it is not asked again (the field is pre-filled from the brief).
6. `days_in_custody` stays and is not used to infer custody (AJ-2026-10-07-T146 rule kept).
7. Tests: unit tests for 2–4 in `bail-guard.test.ts` and a template render test; golden snapshots not auto-updated.
8. One real-model run of criterion 2 if the session has a model key; otherwise say not run.

## Out of scope

- Custody fields on any other document (anticipatory, interim, surrender).
- "S/o" in the verification (T-159).
- Changing the custody clause wording.

## What Ajay must sign (exact)

- The new field block in `apps/drafting/src/config/document-rules/bail_before_magistrate.json`: field ids, labels, options, required/optional, and the show-when-judicial condition for the jail field.
- The one-line change in `apps/drafting/src/services/bail-guard.ts` that makes Rule B apply to `bail_before_magistrate` (and removal of the line ~142 comment).
- Vishal sends both as a diff; nothing merges before Ajay's sign-off reference is in the PR.

## Files (expected)

`config/document-rules/bail_before_magistrate.json`, `services/bail-guard.ts`, `__tests__/bail-guard.test.ts`, a template render test. Must NOT touch `intake-brief.ts` or `intake.prompts.ts` (T-139 owns them this batch).
