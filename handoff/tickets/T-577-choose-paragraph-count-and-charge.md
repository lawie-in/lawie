# T-577: Let the user choose how many paragraphs to draft, with an upper limit and matching charge

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Product (founder request 23 Oct 2026, after testing a draft on develop) |
| Owner  | Arjun (design), Vikram (price per paragraph, cap), Rajesh (UI), Ajay (legal check on what a short/long draft may omit), a lead (build; web, drafting, billing) |
| Mode   | Full chain (web, drafting, billing; touches Ink charge) |
| Status | Server side merged into develop_staging ef5eff68 (Shashank, 23 Oct 2026; CI 1009 green). Web side ready (Tanvi, 1dc7c0fa, Ajay approved), merges after Shashank's retry follow-up (fix/t-577-retry-fresh-quote). Founder seeds pricing.paragraph_bands.base_2 before the stepper appears. Follow-ups T-580. Priya |
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

## Arjun (23 Oct 2026) — after Vikram's ruling: design complete, pending Rajesh

Vikram's bands stand (M packs: ≤10 = 2 Ink, 11–18 = 3, 19–25 = 4; cap 25; `pricing.paragraph_bands.M` as Ink over the class price; S/L priced when they get the stepper). One engineering note on his under-delivery rule ("settle at the band actually delivered, never more than the quote"): the hold is the quoted band; at `finish()` the settle amount is `min(quotedBand, deliveredBand)`. If `settleInk` can settle less than the hold (check the 4th argument), use it and release the remainder in the same call; if it cannot, settle the quote and write one idempotent credit row (`reason: 'paragraph_shortfall'`, keyed on runId) for the difference in the same transaction shape as a refund. Either way `inkDebited` reports the settled figure and the `done` chip matches. The repair round runs before settle, so the delivered count is known at settle time. Test: quote 4, deliver 12 paragraphs → debit 3.

Remaining before build: Rajesh's stepper design (live price from the quote endpoint, Operate surface) and Ajay's per-pack mandatory list for bail. Then Priya claims it for a lead.

## Arjun (23 Oct 2026) — points 1, 4, 6 finalised with Ajay's AJ-577-M1–M3

1. **What is counted:** the user chooses the **total** body paragraph count `N`, in `[mandatoryCount(pack, facts), cap]`. `mandatoryCount` comes from the pack's signed skeleton (bail_regular: 7, or 8 when in custody — opening, FIR details, custody, facts, antecedents, earlier applications, grounds, undertaking); those are always written; the remaining `N − mandatoryCount` are free-form facts/grounds paragraphs. The minimum and the price are shown before Generate; the shown price is a **ceiling** (M3). The server's 400 `paragraph_count_out_of_range` names the real minimum and the cap for that pack and those facts (custody changes the minimum, so the range is computed server-side from the submitted form, not from a static table).
4. **Default when the user skips:** the pack's `defaultBodyParagraphs` (bail_regular: 10, which is today's output and today's 2-Ink price), clamped up to `mandatoryCount` if the facts raise it. Golden set unchanged.
6. **Which types ask:** packs whose signed skeleton declares `bodyParagraphs: { mandatory, default, cap }` — bail_regular first, the other bail packs next (same rule, their own skeleton's required clauses), then the rest by pack as Ajay signs each list. Fixed-form packs (affidavit, vakalatnama, memo of parties) have no such block and never ask. A pack without the block behaves exactly as today.
Design closed. Priya claims: drafting first (Shashank: quote function, range check, prompt target, repair round, settle-at-delivered, skeleton blocks for bail), web second (stepper per Rajesh).

## Arjun (23 Oct 2026) — drafting Explore, eight calls (Shashank)

1. **D1 skeleton path (the live path): (b).** On D1 the count is a **ceiling**: "up to N" paragraphs; the renderer prints one paragraph per rendered clause as today, we settle at the delivered band. No new splitting mechanism (that is v2's document grammar, ADR-026, not a v1 patch to a signed skeleton), and no rerouting bail to the brief path. The stepper copy says "up to" (Rajesh/Madhuri; Ajay sees it). Exact-count behaviour exists only where the prompt already has a TARGET (legacy brief path).
2. **Legacy brief default:** `TARGET_PARAGRAPHS` fallback stays 15 when the request carries no count (today's prompts and goldens unchanged). When the stepper is shown the web always sends a value, defaulting to the skeleton's `default` (10 for bail), so "absent" only ever means a legacy client.
3. **Form path (generate-from-template):** out of scope now; ceiling semantics there later.
4. **Range and quote:** yes — the route checks the range and quotes **after** the ledger/facts are loaded, before `withInkHold`; `enforceCredits` pre-checks against the max band and its 402 carries the quoted figure.
5. **Retry/resume:** yes — `paragraphsRequested` and `inkQuoted` on the run (`resolveRun`); re-quote must match or 409 `price_changed`.
6. **Under-delivery settle:** yes — store the delivered-band units on the hold at delivery; the sweep, the lost-hold re-hold and done-after-sweep settle at that stored figure, never at full cost when it is present.
7. **One `countBodyParagraphs()`** for check, settle and `done`; sub-points do not count. OK.
8. **Bands keying and defaults (Vikram informed):** `pricing.paragraph_bands.<packId>`, falling back to `pricing.paragraph_bands.base_<classPrice>` (`base_2` for M). **Setting missing → the pack does not ask and charges its base price** — the feature degrades to today, never refuses. `expected_ink` on the generate request; mismatch → 409 `price_changed` with the fresh quote (T-540 pattern).
Contract with Priya accepted: `POST /paragraph-quote → { min, max, default, ink, bands, ceiling: true|false }`, 400 with min/max before the hold, `done` adds `inkQuoted` and `paragraphsDelivered`.

## Arjun (23 Oct 2026) — two amendments after build, part 1

1. Band value shape accepted: `pricing.paragraph_bands.<packId>` / `.base_<classPrice>` holding `[{ upTo, add }]` as Ink over the class price (`base_2 = [{upTo:10,add:0},{upTo:18,add:1},{upTo:25,add:2}]`).
2. **Ruling 4 amended:** `enforceCredits` pre-checks against the pack's **min** band (the class price, as today); the exact check is the **hold** after the quote — `holdInk` with the quoted Ink, and its 402 carries the quoted figure. Pre-checking the max band would refuse users who can afford their chosen count and could fire before the range 400. Shown = held = debited still holds.

## Build status (Shashank, 23 Oct 2026): HELD for the founder's decision on a round 3
Branch fix/t-577-paragraph-count @ 8bb4bc03 (pushed, nothing merged). Tester green: drafting 267/267 suites, 16209 tests, snapshots unchanged. bail_regular is exactly Ajay's two lines (AJ-577-M5). Reviewer found no other problems: single price source, refusals before any hold, M6 (charge never above the shown ceiling) on every path, null-config packs unchanged, strict validator, pure extraction of `holds`.
- Review round 1 (FAIL), fixed in d3051b69: MUST: expected_ink was checked before the retry re-quote, so a retry could be held or charged above the shown figure. SHOULD: done-after-sweep showed the delivered band when it had not been stored; the bands warning named the wrong key. NOTE: the validator allowed cap 0.
- Review round 2 (FAIL, open):
  - MUST (documents.routes.ts:1713): on a retry with no count, the route re-quotes and holds at the stored paragraphsRequested (e.g. 19 gives 4 Ink), but the model is still sent targetParagraphs = clampTarget(undefined) = 15. On the legacy brief path (hi/bilingual or no ledger) the user gets a shorter draft and is charged 3. M6 still holds (the charge only goes down) but "the model is told the count" and Arjun's ruling 5 break. Proposed fix (about 3 lines): keep the count actually used (the stored count on a retry), pass clampTarget(thatCount), keep 15 when no count was ever sent; plus a test.
  - SHOULD: the new Generation.findOne in the retry block has no try/catch, so a DB error hangs the request. Proposed: 503 with ids-only logging.
  - SHOULD: rare double failure in done-after-sweep, done shows full cost while the sweep kept the delivered band. Proposed: set deliveredStored once the settle mark is known to have landed.
  - NOTE for Arjun: ruling 5's legacy-path repair round and "drafted N of M" warning are not in this diff (they need ai.service.ts and brief-drafter.ts, not in the claim). Deferred to a follow-up, or in scope?
- Priya recommends: approve one narrow round 3 for the MUST (3 lines + test) and the two SHOULDs; Arjun decides the NOTE. Money path, so no merge without a clean fresh reviewer.

## Arjun (23 Oct 2026) — after the second failed review: one narrow round 3 approved

Per the rule, a second fail comes to me; the founder has given full approvals on tickets, so this is my decision and he is told, not asked.

- **MUST:** fix as Shashank proposes — the count actually used (the stored `paragraphsRequested` on a retry) drives `clampTarget`; 15 only when no count was ever sent; plus the test (retry with no body count → prompt target equals the stored count, hold equals the stored quote). This matches ruling 5: the model is told the count that was quoted.
- **SHOULD 1:** `Generation.findOne` in the retry block wrapped; DB error → 503 `try_again`, ids-only log.
- **SHOULD 2:** set `deliveredStored` only once the settle mark is known to have landed, so `done` never shows full cost when the sweep kept the delivered band.
- **NOTE (ruling 5's repair round and the "drafted N of M" warning):** deferred to a follow-up ticket after Mahak's T-567 merges (`ai.service.ts`, `brief-drafter.ts` are hers). Until then under-delivery on the legacy path simply settles at the delivered band (M6), which is the honest outcome without the warning. Priya posts it.
- Scope of round 3 is exactly these three items; anything else found is a new ticket. Same developer → fresh tester → fresh reviewer. Money path: no merge without a clean reviewer. If round 3 fails, the ticket is parked and the founder decides whether to continue.

## FINAL API CONTRACT (Shashank, 23 Oct 2026; branch fix/t-577-paragraph-count @ 065166c0, round 3 reviewed clean)
1. `POST /api/documents/paragraph-quote` `{kind, values?, ledger_id?, paragraphs?: int 1-100, language?}` returns `{asks:false, ink}` or `{asks:true, ink, min, max, default, paragraphs, bands:[{from,to,ink}] (clipped to min..max), ceiling:bool}`. No hold, no model call. Errors 400/404/503/500.
2. `generate-from-brief` accepts `paragraphs?: int` and `expected_ink?: number` (steps of 0.5). Out of range: 400 `{error:"paragraph_count_out_of_range", min, max, paragraphs, message:"Choose between <min> and 25 paragraphs."}` (web renders Ajay's EN/HI AJ-577-M4 from `min`). `expected_ink` differs from the held price, or a retry no longer matches: 409 `{error:"price_changed", ink}`. Both before any Ink hold. A retry DB failure: 503 `{error:"try_again"}`.
3. The `done` event adds `inkQuoted` and `paragraphsDelivered` when `asks:true`. `inkDebited <= inkQuoted`; the web shows the AJ-577-M1 (3) lower-debit line when it is less.
4. `GET template-configs` adds `asks_paragraphs` per row (true for bail_regular once bands are seeded).
5. Bands: AppSettings `pricing.paragraph_bands.<packId>`, else `.base_<classPrice>`, holding `[{upTo, add}]` Ink over the class price. FOUNDER MUST SEED `base_2 = [{"upTo":10,"add":0},{"upTo":18,"add":1},{"upTo":25,"add":2}]`; until then nothing asks and prices are unchanged.
Web side (stepper per Rajesh §5, "up to" strings AJ-577-M6) builds against this contract after Shashank merges.

## Arjun (23 Oct 2026) — retry after `price_changed`: (b), server

**(b).** On a retry that carries `paragraphs` + `expected_ink`, the server validates against a **fresh quote** for that count, not the stored row; when it matches, it **updates** the run's `paragraphsRequested` / `inkQuoted` and holds at the fresh figure (the earlier hold was released with the failed run). A retry with neither field keeps today's behaviour (stored count, stored quote). (a) is rejected: a second run while the first hold may be unreleased risks a double hold. Sequencing as Priya proposes: Shashank's server merge goes now (it is also the red-CI fix; nothing asks for paragraphs until the founder seeds the bands, so the loop cannot occur yet); the (b) fix is a small server follow-up with a fresh reviewer, merged **before** Tanvi's web part. Test: fail → 409 price_changed → retry with new expected_ink and same run_id → 200, hold equals the fresh quote, row updated.
