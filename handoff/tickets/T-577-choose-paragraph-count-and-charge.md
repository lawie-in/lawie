# T-577: Let the user choose how many paragraphs to draft, with an upper limit and matching charge

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Product (founder request 23 Oct 2026, after testing a draft on develop) |
| Owner  | Arjun (design), Vikram (price per paragraph, cap), Rajesh (UI), Ajay (legal check on what a short/long draft may omit), a lead (build; web, drafting, billing) |
| Mode   | Full chain (web, drafting, billing; touches Ink charge) |
| Status | To do. Design first; no build until Arjun, Vikram and Rajesh have settled the open points below. Priya, 23 Oct 2026 |
| Source | Founder, 23 Oct 2026 |

## What the founder asked
Ask the user how many paragraphs they want, draft that many, and charge accordingly. There is an upper limit on the number of paragraphs.

## Open points for Arjun, Vikram, Rajesh (defaults proposed, so nobody waits on the founder)
1. Which part is counted: the facts/grounds body paragraphs (default), not the cause title, prayer, verification or fixed legal headings.
2. Cap: default 25 paragraphs; Vikram sets the cap and the price per paragraph so the per-draft price stays inside the Ink plan economics.
3. Charge: price derived from the chosen count and shown before the user starts, using the existing single-quote path so "shown equals charged" (T-388) holds; hold-and-release unchanged.
4. Default count when the user skips: a document-type default, so today's flow still works.
5. Quality guard (Ajay): a very short count must not drop required legal content (grounds the law requires); the pack's mandatory paragraphs are kept and the count applies to the free-form remainder.
6. Which document types: bail first, then the rest by pack; types with a fixed form (affidavit, vakalatnama) do not ask.

## Acceptance criteria (once the points are settled)
1. The intake asks for a paragraph count within the cap, with the price shown before generate.
2. The model is told the count; the verifier and the post-processor accept a draft within the count (no silent truncation or padding).
3. Ink hold and the final debit equal the quoted price for that count; the chip in the done event shows the same number (T-545).
4. Out-of-range counts are refused by the server, not just the form.
5. Tests; golden set unchanged for the default count.

## Files
Claimed by Priya when a lead takes it, after design sign-off.

## Arjun (23 Oct 2026) — design, short

1. **Counted:** the free-form body paragraphs only (facts + grounds), after the pack's mandatory paragraphs. Cause title, prayer, verification, headings, mandatory legal paragraphs: never counted, never cut. The server computes `mandatoryCount` from the pack, so the user picks `extraCount` in `[packMin, cap − mandatoryCount]`.
2. **Cap and price: Vikram** (asked). Default cap 25 total until he rules. Price is a step function in Ink, not per paragraph: small/medium/large bands (e.g. ≤8 / ≤16 / ≤25) so the quote stays a whole-Ink figure and the T-453 cost classes keep meaning. Bands and Ink per band are Vikram's numbers, in AppSettings (`pricing.paragraph_bands`), not code.
3. **Shown equals charged (T-388):** `costForTemplate(templateId, extraCount)` is the one quote function; `enforceCredits` holds that figure, `finish()` settles it, `inkDebited` (T-545) reports it. The count is part of the run record, so a resume or retry re-quotes identically. **Server-side range check** returns 400 `paragraph_count_out_of_range` with the allowed range; the form never decides.
4. **Default when skipped:** the pack's current default count (what today's draft produces) → today's flow and the golden set are unchanged.
5. **Model and verifier:** the count goes into the prompt as a hard target with ±1 tolerance; the post-processor **never truncates or pads**: under by >1 → one repair round asking for the missing paragraphs; over by >1 → one repair round asking to merge; still off → deliver as is with a `warning` event ("drafted N of the M paragraphs you asked for") and charge the **quoted** band (never more). Ajay's guard: mandatory paragraphs are outside the count by construction, so a short count cannot drop required content; he confirms the mandatory list per pack.
6. **Scope:** bail first; packs with a fixed form (affidavit, vakalatnama) do not ask. Rajesh designs the control (a stepper with the price updating live, Operate surface).
Follow-up, not now: v2's compiler reads the same `extraCount`.
