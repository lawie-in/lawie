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
