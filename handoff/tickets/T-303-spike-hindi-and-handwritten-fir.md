# T-303 — Spike: can we read Hindi and handwritten FIRs?

| Field      | Value                                          |
| ---------- | ---------------------------------------------- |
| Phase      | 3 — Matter context                             |
| Owner      | Vishal, Ajay reviews the result                |
| Mode       | Spike, time-boxed to 1 day, no production code |
| Status     | Ready. T-302 is delivered                      |
| Depends on | None open. T-302 is delivered                  |
| Branch     | None                                           |
| Created    | 2026-10-03                                     |

## Goal

Know what we can honestly promise about reading FIR photos.

## Context

- Many district-court FIRs are in Hindi and some are handwritten. The founder is in the Bihar and Jharkhand region.
- Reading typed English pages is expected to work. The rest is untested.
- If the model reads Hindi or handwriting badly, test one OCR service on the same pages. OCR is not needed for cost (ADR-019, section 3.9).

## Acceptance criteria

- At least 10 real FIR images are tested: typed English, typed Hindi and handwritten.
- Accuracy is reported per field: FIR number, police station, date, sections, and names.
- The result says which kinds of page we can promise, which we cannot, and what the review screen should warn about.
- Test images are handled under the T-302 rule and deleted afterwards.
- The result is written into this file.

## In scope

- A throwaway script and a written result

## Out of scope

- Any production code
- A separate OCR vendor, unless the result says the model alone is not good enough

## References

- Design: Not needed
- ADR: Not needed
- Legal sign-off: Ajay, T-302, 4 Oct 2026. Made-up or fully redacted pages only

## Review, 3 Oct 2026

| Reviewer | Verdict  | Note                               |
| -------- | -------- | ---------------------------------- |
| Arjun    | Approved | One day, throwaway script.         |
| Ajay     | Approved | Test images follow the T-302 rule. |
