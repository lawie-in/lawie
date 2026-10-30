# Scope: case research, argument preparation, flexible section finder

Founder ask, 30 Oct 2026. Status: SCOPING. No build this month. Priya draft, for Arjun (architecture and data source), Ajay (legal accuracy), Vikram (cost) and Rajesh (UI).

## Competitor check: lawttorney.ai (site read 30 Oct 2026)
Claims: AI case research over "millions of Indian case laws" (SC and HC judgments) by topic, keyword or citation, with summaries and precedents; a bare-act and statute database; drafting (petitions, notices, contracts, agreements, decrees); a "Verify AI response" button (re-runs the prompt); research history; prompt hints; voice search; web, iOS and Android; plans aimed at judges, advocates, corporates and students (moot court prep). Press: Pune company founded 2025; the claims are unverified marketing. Its "argument building" is only research plus citations; we found no dedicated argument tool.
Where we can win: they lead with research breadth. We lead with court-ready drafting. Argument preparation tied to the advocate's own matter (facts, ledger, court) is a gap they do not fill.

## T-709: Case research (P1, L)
For an advocate: "find me judgments on X". Search Indian SC and HC judgments by plain question, keyword, citation or section; return relevant cases with a short summary, the holding, the citation and the court and date; open the full text.
Hard gates:
1. Data source (Arjun and Vikram): which judgment corpus (licensed feed, eCourts/SCI and HC public judgments, Indian Kanoon API, or a commercial provider), its coverage, update lag, licence and cost.
2. No invented citations (Ajay): every case shown must exist in our corpus with a verifiable citation. The model may summarise and rank, never cite from memory.
3. Retrieval design (Arjun): search index plus model ranking and summary; cost per query; Ink price (Vikram).
First cut: SC plus 2-3 high-traffic HCs, criminal and civil procedure topics.

## T-710: Argument preparation (P1, M-L), the differentiator
For a matter already in Lawie: "prepare my arguments". From the brief/ledger, the court and the document type, produce:
- the issues to be decided;
- our arguments, each with the facts relied on, the provisions and the supporting judgments (from T-709's corpus only);
- the opponent's likely arguments, with rebuttals;
- the gaps: facts or documents still needed;
- a short oral-submission note (1-2 pages), exportable.
Gates: depends on T-709 for authorities (without it, provisions only and no case law); Ajay signs the structure and the "not legal advice / verify" wording; Vikram prices it in Ink.

## T-711: Flexible section finder (P1, S-M)
Today: the tools page section converter (old code to new code) only. Make it:
- accept plain language ("cheating by a public servant", "anticipatory bail"), a section number in any code (IPC/BNS, CrPC/BNSS, Evidence/BSA, CPC, NI Act and so on), or a partial or misspelt name;
- return the matching sections in both old and new codes, with title, short text, punishment or limitation where relevant, and the bare-act link;
- allow "related sections" and filtering by Act;
- tolerate typos and Hinglish;
- be free and public (marketing funnel) with a daily limit, plus inside the app linked from the brief.
Gates: the bare-act data is signed by Ajay (mapping accuracy); fix the /tools 404s first (audit P0).

## Order proposed
T-711 first (small, also fixes the tools pages), then the T-709 data-source decision, then T-710 built on T-709.
## Questions for the founder
1. Should case research be its own paid feature (Ink per search) or part of plans?
2. Budget ceiling for a judgment data source per month?

## Arjun's early read (30 Oct 2026; to be verified next month, then an ADR)
Data sources, in evaluation order:
1. Official and free: the SC judgments portal and eSCR (SC complete); HC sites via eCourts/NJDG (patchy). Public records, so no licence issue, but each site's scraping terms need checking. High engineering cost (crawler, OCR).
2. Indian Kanoon paid API: broadest coverage. A written licence for commercial reuse and storing the text is the biggest gate.
3. SCC Online / Manupatra: best quality, but no AI or redistribution licence. Treat as "the user brings their own subscription".
4. Open datasets (OpenNyAI etc.): for building and evaluation only.
Architecture: ingest, then split paragraphs with citation, bench, date and court metadata; hybrid search (BM25 plus embeddings); re-rank; summaries only from retrieved text; a cite-check that refuses any citation not resolved to a stored judgment. T-710 uses the same store plus the matter facts. Cost: embeddings for 1-2M judgments plus per-query summaries, Ink-gated.
T-711: no external data. An alias/tokeniser layer on our codes plus old-to-new maps (IPC-BNS, CrPC-BNSS, IEA-BSA). Cheapest; goes first.
Ajay: the licence, and the liability wording for "no invented citations".

## Decisions delegated to the team (founder, 30 Oct 2026: "Take all the decisions yourselves... just scope the work, don't start anything")
Priya's defaults, for Arjun and Vikram to confirm next month:
1. Pricing: case research and argument prep are charged in Ink per use (the same Ink gating as drafting); Vikram sets the Ink price from measured cost. The section finder is free with a daily limit.
2. Data source: start with the official SC portal/eSCR (free) for T-709 v1; ask Indian Kanoon in writing for a commercial licence and price. Any paid source needs a monthly cap that Vikram sets, at or below projected research revenue.
3. Order: T-711 first, then the T-709 data-source ADR (Arjun), then T-709 v1 (SC only), then T-710.
Nothing starts until next month.
