# T-198 — Rent agreement asks for and keeps both fathers' names

| Field          | Value                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| Phase          | 1 — Describe and draft                                                                                    |
| Owner          | Ajay (field and wording, signs). Lead applies. Anushka (verdict)                                          |
| Mode           | Legal content (pack change), then a small change through the lead                                         |
| Status         | To do. Waits for Ajay's signed field definition                                                           |
| Size           | Ajay S (0.25 day). Build S (0.5 day)                                                                      |
| Depends on     | None                                                                                                      |
| Gate           | Before v1 go-live (T-403)                                                                                 |
| Branch         | fix/t-198-rent-agreement-fathers-names                                                                    |
| Legal sign-off | Needed. `apps/drafting/src/config/document-rules/rent_agreement.json` is legal content                    |
| Created        | 2026-10-11                                                                                                |
| Source         | Anushka's run 2 (7 Oct, scenario 7: "both fathers' names in the rent agreement" dropped); confirmed in the T-147 build |

## Problem

`rent_agreement.json` has no field for the landlord's or the tenant's father's name. The advocate gives them in the description; the draft drops them. A rent deed without "S/o" or "D/o" for each party is not how a district advocate writes one.

## User

Advocate drafting an 11-month rent agreement for a client in Patna who gave both fathers' names.

## Solution

Add a father's-name (or husband's-name) item for the landlord and for the tenant to the rent agreement pack, as Ajay defines it.

## Acceptance criteria

1. Ajay writes in this file: the two item keys, labels, whether each is required, and how the party line prints (S/o, D/o, W/o). He signs it.
2. Both items are in `rent_agreement.json` exactly as signed.
3. Test: given in the description, both names print in the party lines of the draft.
4. Test: not given, each is asked (if required) or prints `[To be confirmed: label]`. Never guessed.
5. With `feature.fact_ledger` on, each value has a verbatim `raw_span` (T-147b).
6. Golden snapshots run. Any change is read and approved by Ajay, never updated automatically.
7. CI green on drafting.

## Out of scope

- Other deeds (lease, sale, GPA): a follow-up if Ajay wants the same
- The "sirf rehne ke liye" (residential use only) term, also dropped in run 2

## References

- `handoff/quality/2026-10-07-run-2-develop-FAIL.md`, scenario 7
