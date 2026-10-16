# T-480: Intake re-asks facts already given, and no longer reads address, antecedents or dependants

| Field  | Value |
| ------ | ----- |
| Status | To do. V1 (major). Priya, 16 Oct 2026 |
| Owner  | Vishal (intake owner), after T-471 |
| Mode   | Full chain |

## Source

Anushka quality run 4 on develop, 16 Oct 2026 (handoff/quality/2026-10-16-run-4-develop-FAIL.md). Priya triaged it on 16 Oct 2026.

## What Anushka saw (regular bail, same facts as 13 Oct)

- Intake re-asked seven facts already in the description: name, FIR number, sections, police station, custody, father's name, age.
- The brief no longer read the address, the antecedents ("never been accused") or the dependants ("elderly mother aged 72"); all were read on 13 Oct.
- Governing law left as "[To be confirmed: Section 439 CrPC or Section 483 BNSS]" in title, para 2 and prayer, although she chose "BNSS and BSA" and the arrest was on 20 Sep 2026.
- Para 14 contradicts itself ("the brief records "None". [To be confirmed: ...]"); para 7 says "[To be confirmed: grounds]" then lists them.
- Default bail: the earlier rejection given in the description was not carried into the brief.

## Why it may be

The model switch (Haiku 5.5 intake) and effort low/medium. Her build may predate T-453's follow-up (intake effort medium, caps 3000/4000). First step: re-run her same inputs on the current develop_staging build and compare; then fix what remains. Cost per draft stays inside Vikram's limit.

## Acceptance criteria

- Same description and choices as her 13 Oct regular bail: no re-asks of facts given; address, antecedents and dependants read; chosen law shows in title, para 2 and prayer; no contradictory paragraphs.
- Golden set: no regression against run 64; Ajay sees diffs.

