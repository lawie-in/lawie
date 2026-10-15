# T-303 — Spike: can we read Hindi and handwritten FIRs?

| Field      | Value                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------- |
| Phase      | 3 — Matter context                                                                                      |
| Owner      | Vishal, Ajay reviews the result                                                                         |
| Mode       | Spike, time-boxed to 1 day, no production code                                                          |
| Status     | Founder 15 Oct 2026: uploads are V1. Ready: T-302 delivered. Vishal runs the spike, Ajay reviews. Priya |
| Depends on | None open. T-302 is delivered                                                                           |
| Branch     | None                                                                                                    |
| Created    | 2026-10-03                                                                                              |

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

## Arjun (15 Oct 2026, 05:25 UTC) — spike rulings

1. **Pages**: made-up only (T-302). Ajay writes the FIR text (typed English and typed Hindi in Devanagari, Bihar/Jharkhand style, at least 4 of each); Vishal renders the typed ones to phone-camera-quality images (slight skew, 1,568 px long edge, JPEG ~q80). Handwritten pages are photographed by the founder (3–4 pages of Ajay's text); until they arrive the result reports handwritten as "untested, waiting on pages". No real or redacted-from-real page, no handwriting faked with a font. All pages deleted when the spike ends.
2. **Models**: `ai.intake_model` and `ai.drafting_model` (AppSettings, direct to Anthropic), same pages and prompt, accuracy per field per model. No OCR vendor is called in the spike; if the stronger model fails typed Hindi, the result names the one to try (Google Cloud Vision) and stops — that is the founder's decision.
3. **Budget**: USD 5 hard cap in the throwaway script, counted from provider usage; tokens per page per model recorded for Vikram's per-page cost line. Outside intake quota and spend cap, because the script never runs in a service.
4. **ADR-019 §3.9 / ADR-021**: never committed to git. The decisions are in `handoff/tickets/T-006-adr-intake-and-routing.md` and `T-123-adr-021-one-drafting-flow.md`; the §3.9 cost controls are the lines quoted in T-301 and T-304. Those are the rule. Consolidating the ADR text into the repo is parked to after v1.
