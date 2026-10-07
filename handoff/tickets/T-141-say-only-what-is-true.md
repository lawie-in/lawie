# T-141 — The product says only what is true about itself

| Field      | Value                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| Phase      | 0 — Prep                                                                                                      |
| Owner      | Meera and Madhuri (words), Ajay (claims), Vikram (plans), Anushka (verdict)                                   |
| Mode       | Full chain, then the quality gate                                                                             |
| Status     | Needs scoping. Not started. Cause not traced yet                                                              |
| Depends on | None                                                                                                          |
| Branch     | fix/t-141-say-only-what-is-true                                                                               |
| Created    | 2026-10-06                                                                                                    |
| Source     | Anushka's run 1, 6 Oct 2026, verdict FAIL. Her words are in `handoff/quality/2026-10-06-baseline-run-FAIL.md` |

## Goal

Nothing on a public page or in the app promises what the product does not do.

## What Anushka found

- **Major.** "Draft court-ready legal documents in under 5 minutes" against the draft's own banner "Starting draft — review before use · not court-verified".
- "Cheque bounce complaints" listed as available on the home page and FAQ; the catalogue has the notice only.
- FAQ: "Every section cited in a generated document is validated against these mappings before it appears in your draft." The draft she read cited three wrong sections.
- FAQ: works on mobile. FAQ: "District and High Courts across Bihar, Jharkhand, UP, and Delhi".
- Pricing: Pro's "Everything in Solo, plus" lists the same three items as Solo.
- Already open from T-131: /pricing, /faq and the editor say free exports carry a watermark; the code adds none.

## Acceptance criteria (draft, Priya to confirm)

- Each statement above is either made true or removed.
- Ajay reads the home, pricing and FAQ pages once for claims and signs the result.
- Anushka tests again from the start and her verdict is PASS.
