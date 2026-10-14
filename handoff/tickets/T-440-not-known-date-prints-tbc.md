# T-440: a "Not known" date prints "[To be confirmed: …]"

| Field  | Value                                                                  |
| ------ | ---------------------------------------------------------------------- |
| Status | Ready to merge b89719ee (Shashank; reviewer PASS, Ajay closed 0653e4f). Waits for green develop_staging. Priya, 14 Oct 2026 |
| Owner  | Shashank (build), Ajay (ruled 49a8eaa)                                 |
| Mode   | Full chain (drafting prompts and printed text are legal content)       |

Source: Ajay's T-384 ruling, 49a8eaa (T-404 file addendum). Must-fix: wrong legal text in a printed draft. T-384 (Kunal) stays web-only.

## Acceptance criteria

1. A date the advocate answered "Not known" prints "[To be confirmed: {field label}]" in the draft, for example "[To be confirmed: date of the invoice]". It never prints blank or "_____", and it is never guessed.
2. Nothing is computed from an unknown date: no day counts, no "within 30 days" claims, no limitation arithmetic.
3. The drafting prompt states that the date is unknown.
4. Both paths behave the same: the brief/ledger path and the template-form path.
5. Tests cover AC1-4. Any golden snapshot change is signed by Ajay.

## Out of scope

The web chip and the "Change" link (T-384, Kunal). Choosing "Not known" from the brief (parked).
