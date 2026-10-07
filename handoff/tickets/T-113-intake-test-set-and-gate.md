# T-113 — Intake test set and the gate before switching on

| Field      | Value                                                                                                                                   |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Phase      | 1 — Describe-first intake                                                                                                               |
| Owner      | Priya and Ajay (the set), Vishal (the script)                                                                                           |
| Mode       | The set is written by hand. The script goes through the dev lead                                                                        |
| Status     | Script built 4 Oct 2026 and checked with a live 4-item trial. The set (Priya and Ajay) is not written yet, so the gate has not been run |
| Depends on | T-101                                                                                                                                   |
| Branch     | feature/t-113-intake-gate                                                                                                               |
| Created    | 2026-10-04                                                                                                                              |

## Goal

Proof, on real examples, that describe-first picks the right document and invents nothing, before any user sees it.

## Context

- ADR-019, section 5, sets a gate that must pass before `feature.describe_first` is switched on. It had no ticket until now.
- The main risk of the whole flow is a confident match to the wrong template.
- The script calls the real model, so it costs money and runs by hand, not in CI.

## Acceptance criteria

- A labelled set of at least 150 descriptions: at least one for each of the 92 templates, at least 30 court requests with no template, and at least 20 that are not legal drafting. Some are in Hindi or mixed language.
- Each description carries the expected result: the template, guided strict, guided light, or no match.
- The set contains no real personal data.
- A script runs the set against the intake route and reports each failure.
- Gate 1: confident and wrong (high confidence, wrong template) is 2 percent or less.
- Gate 2: no court request is handled in light mode.
- Gate 3: no filled value reaches the response without a matching quote.
- Gate 4, once T-106 exists: no invented section numbers, names, dates or amounts in guided drafts across the set.
- The results are saved next to the ADR. Describe-first is not switched on for users until the gates pass.

## In scope

- The test set file
- A script under `scripts/`

## Out of scope

- Running in CI
- Changing prompts to pass the gate without Ajay

## References

- Design: Not needed
- ADR: `docs/adr/ADR-019-intake-and-routing.md`, approved by the founder on 4 Oct 2026, section 5
- Legal sign-off: Not needed

## Script (Vishal, 4 Oct 2026)

**Run it**

```
yarn workspace @lawie/drafting gate:intake --set <set.json> --dry-run   # checks the set only, no cost
yarn workspace @lawie/drafting gate:intake --set <set.json> --yes       # real model, about $0.01 an item
```

Results go to `docs/adr/ADR-019-gate-results/<timestamp>.json`. The JSON holds the summary plus one line per item. Each failure is also printed.

**Set format.** A JSON array of entries like this:

```
{ id, description, expected, also_ok?, court?, language? }
```

- `expected` is a template id, `guided_strict`, `guided_light` or `no_match`.
- `scripts/intake-gate/example-set.json` shows the format. Its 4 labels are mine and only illustrative.

**What the script does**

- Refuses to run a set below the composition rules unless `--allow-small-set` is passed. A small run is labelled as a trial that cannot pass the gate.
- Each item runs through the real `/intake` route in-process, as its own synthetic user, so the 10-per-10-minutes limit does not block a full run.
- Gate 1: a `matched` outcome with a template outside `expected` and `also_ok` counts as confident and wrong. `needs_choice` that includes the right template is not counted.
- Gate 3: every value read from the description must carry a quote that appears in the description. This is checked again here, independently of the server.
- **Gates 2 and 4 are reported as "not measurable".** Light and strict mode only exist with T-105, and guided drafts with T-106. The ADR's switch-on condition cannot be met in full until those ship. Add both to the script then.

**Checked**

- `apps/drafting/src/__tests__/intake-gate.test.ts`: 8 tests on the scoring.
- A live trial of the 4-item example on `claude-haiku-4-5-20251001`, throwaway database: gate 3 passed, 7 usage rows written, results JSON saved.
- Two of my example labels were wrong. A `writ_petition_civil` template exists, and the parking consent was matched to `license_agreement`. That is the reason the real labels have to come from Ajay and Priya, with `also_ok` for templates that genuinely overlap.

## Update, 5 Oct 2026: the set and the gate under ADR-021

ADR-021 is approved. The flow is now one path for every document, so the set and the gate change.

The set of descriptions must also include:

- At least 10 for regular bail and 10 for anticipatory bail, in English, Hindi and Hinglish, with the founder's sentence of 5 Oct among them.
- Descriptions with one date and no stated meaning, and with two dates of different meaning.
- At least one description for each category of rule pack, and at least 15 with no rule pack.

The gate fails on any of these across the set:

- Regular and anticipatory bail swapped.
- A date placed under a meaning the description did not give.
- A draft with a rule pack that reaches the user without its label while a mandatory clause is missing.
- A fact, name, date, amount or section number in a draft that is not in the brief.
- A court taken from the model.

The gate runs after T-105 and T-106 are built.
