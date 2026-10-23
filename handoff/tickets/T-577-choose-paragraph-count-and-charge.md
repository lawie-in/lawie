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

## Vikram (23 Oct 2026): cap and Ink bands

**Measured basis** (develop database, Sonnet 5.5 at $2/$10 per MTok, rows since 15 Oct; 695 golden-set rows and 14 user rows, so read the user figure as indicative):

| Bail drafts | Rows | Avg paragraphs | Avg cost | p90 cost |
|---|---|---|---|---|
| 1–8 paragraphs | 327 | 7.3 | $0.015 (₹1.3) | $0.020 (₹1.8) |
| 9–16 paragraphs | 84 | 10.3 | $0.023 (₹2.0) | $0.027 (₹2.4) |
| User rows, all kinds | 14 | n/a | $0.041 (₹3.6) | n/a |

Intake and preflight add about ₹0.1 per call, ≈ ₹0.5 per draft. The heaviest non-bail drafts (17 paragraphs, ~9k output tokens) cost up to $0.14 (₹12).

**Planning figures:** a default-length bail draft is ≈ ₹4 all-in at the user-row rate. Each extra free-form paragraph is ≈ ₹0.5 (p90, with thinking and repair rounds). Line: ₹3.70 API cost per Ink.

**1. Cap: 25 total body paragraphs for bail.** It is affordable (below) and is already longer than any bail draft we have produced. Set per pack in AppSettings; other packs get their own cap when they are enabled.

**2. Bands for bail (and any pack priced M = 2):** price by the total paragraph count, mandatory plus extra.

| Total paragraphs | Ink | Worst-case cost | Per Ink |
|---|---|---|---|
| up to 10 (covers today's default) | 2 | ≈ ₹4 | ₹2.00 |
| 11 to 18 | 3 | ≈ ₹8.8 | ₹2.93 |
| 19 to 25 | 4 | ≈ ₹13 | ₹3.25 |

- **No band below the pack's class price.** A short bail draft is still 2 Ink. At 1 Ink, the user-row cost (₹4) would sit over the line, and a cheaper "short" option invites drafts that drop grounds. The default count stays at today's price, so the golden set and today's flow are unchanged.
- Bands are **Ink added over the pack's class**, stored as `pricing.paragraph_bands = { M: [{upTo:10, add:0}, {upTo:18, add:1}, {upTo:25, add:2}] }`. S and L packs get their own rows when they get the stepper; I price each before it ships. These are not S/M/L reclassifications: a long bail stays an M pack, it just costs more Ink.
- **Settle at the lower band when fewer paragraphs are delivered.** If the "drafted N of the M you asked for" warning fires and N falls in a lower band, charge the lower band: never more than quoted, and less when we under-deliver. The quote shown stays the maximum, so T-388 holds.
- **Review:** in my monthly class review, the p90 cost per Ink for each band must stay under ₹3.70. A band over the line gets one more Ink, by founder decision, with the copy re-signed by Meera and Ajay. Changing a band's Ink is a price change, so it is the founder's call even though AppSettings makes it editable.

**3. T-579 (annexures as DOCX beside the PDF): no extra Ink. Agreed with Arjun.** It is a format conversion of a paid draft, about ₹0 per run. Same condition as T-381: if a model call is ever added to the DOCX path, it comes back to me for a price before merge.

Vikram, CFO
