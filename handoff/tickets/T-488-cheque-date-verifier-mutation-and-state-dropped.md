# T-488: s.138 drafts: the verifier mutates the cheque date, and the State is dropped (golden 07/20 and others)

| Field  | Value |
| ------ | ----- |
| Status | To do. V1 (found in golden real run 69, 16 Oct 2026). Priya |
| Owner  | Vishal (after T-480), Ajay gates |
| Mode   | Full chain |

## Source

Vishal, golden real run 69 (10/27 pass, was 8/27): after the T-471 firm fix, fixtures 1b/08/19/21 keep the firm, but their other failures, a cheque-date verifier mutation and the State being dropped, also hit 07 and 20. Not caused by T-471.

## What

Explore the failing cases in run 69: why the verifier changes a cheque date, and where the State goes missing. Fix both; Ajay sees any text or date change.

## Acceptance criteria

- The cheque date is never changed by the verifier (dates correct, as Anushka's run found).
- The State appears where the brief names it.
- Golden fixtures 07/08/1b/19/20/21 pass those checks; Ajay's ref in the merge body.

## Ajay's ruling, State party name (ref ca12ec2e, 16 Oct 2026)

A State prints "State of {state}". Delhi prints "State (Govt. of NCT of Delhi)", never "State of Delhi". Other Union Territories print a blank until Ajay verifies the form. This covers the State point here and Shashank's parked Delhi quashing title.

## Added 16 Oct 2026 (from Shashank's T-479 merge)

- `state_of_filing` does not feed `{state}`.
- The ledger drafter's writ_civil prompt gets the no-State line, not the State name.
(Both belong with the State work here. Ajay's party-name ruling ca12ec2e applies.)
