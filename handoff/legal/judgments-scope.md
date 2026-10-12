# Judgments: what we could build (scope draft, 12 Oct 2026 IST)

Ajay (CLO). A scoping note, not a sign-off. No source licence or case below is verified: where I write "verify" it is open. Decisions on scope are Priya's and the founder's; architecture is Arjun's (ADR).

## Why it is worth doing, and why it is risky

Advocates spend hours on authorities. A tool that finds, reads and checks judgments is useful. But a wrong or invented case in a filed document is the worst failure a legal tool can have (Indian courts have already warned lawyers about AI-invented citations). Today Lawie has the opposite rule on purpose: **T-148, no case law the advocate did not give**, enforced by `citation-check.ts` (T-263). Anything below that lets Lawie name a case reopens T-148, so it needs my fresh rule first.

## Five things we could build, safest first

| # | Feature | What it does | Legal risk | Needs a corpus? |
|---|---|---|---|---|
| 1 | **Judgment summary** | The advocate pastes or uploads a judgment; Lawie returns issues, holding, relief, key paragraphs, with paragraph numbers quoted from the text | Low. Works only on text the user gave. Must say "check against the judgment" and never call a summary the law | No |
| 2 | **Citation check** | The advocate gives a citation; Lawie says whether it exists, which court, date, bench, and shows the matching text | Low to medium. Never says "good law". A miss means "not found in our sources", not "does not exist" | Yes |
| 3 | **Search by issue** | Natural-language search over judgments; results are real documents with a link and the matching passage, no generated "holding" in the list | Medium. Ranking can bury the controlling case; needs the court and date shown on every hit | Yes |
| 4 | **Grounded citing in drafts** | The draft may cite a judgment, only from the corpus, with a verbatim quote and paragraph, confirmed by the advocate before it enters the draft | High. Needs a T-148 amendment, a "status" check (overruled, distinguished) and Anushka's sampling on every release | Yes, plus a citator |
| 5 | **Opposing citations check** | Upload the other side's note; Lawie lists their citations and checks each against the corpus | Medium | Yes |

Recommended order: **1, then 2, then 3**. Do 4 only after 1 to 3 have run on real advocates for a few weeks.

## Where the judgments come from (the big open question)

| Source | Position (all to verify before use) |
|---|---|
| Supreme Court and High Court websites, eCourts | Judgments are public. Copyright law lets a judgment be reproduced; reporter headnotes are separate. Bulk download terms and rate limits unknown: verify |
| Indian Kanoon | Free website; its terms on scraping and commercial reuse: verify, likely needs a licence |
| SCC Online, Manupatra, AIR | Paid and licensed; the licences normally bar copying, indexing or AI use. Treat as off limits unless a written licence says otherwise |
| Open legal datasets | May exist; licences differ. Verify each |

A first corpus of **Supreme Court judgments only** (plus a few busy High Courts later) is the sensible start.

## Rules I would set before any build (so the build team has a reference)

1. **No invented authority.** Every case shown must come from a stored document, with court, date, and a link to the source text.
2. **Quote, do not paraphrase, anything shown as a holding.** Summaries (feature 1) are labelled "summary of the text you gave".
3. **No status claims.** Never "good law", "binding", "overruled" without a citator we trust; until then, "check the current status".
4. **Personal data.** Judgments contain names of parties and victims. Show them as published (courts anonymise sensitive cases); do not add data; no profile of a person from their cases. DPDP: legitimate use of publicly available data, but we log no query text with names (same rule as the assistant).
5. **Disclaimer** on every result: `Legal information, not legal advice. Check the judgment before you rely on it.` (my signed assistant line, adapted).
6. **Where it sits**: separate from the Lawie Assistant (T-253), whose rules refuse case law. The assistant stays as it is.
7. **Cost and rate guards** before any Anthropic call (house rule).
8. **Quality**: Anushka tests each release on real matters (tier A sampling).

## Rough phases (effort is Arjun's to size)

| Phase | Scope | Gate |
|---|---|---|
| P0 | Feature 1 on user-supplied text; my wording for the labels | My rule + Arjun's ADR |
| P1 | Feature 2 on a Supreme Court corpus | Source licence confirmed by me |
| P2 | Feature 3; more courts | Anushka's pass on P1 |
| P3 | Feature 4 in drafts | New T-148 rule from me; citator decision; founder |

## Questions for the founder and Priya

1. Which first: summary (P0) or citation check (P1)? I suggest P0 then P1.
2. Who confirms source licences? I can, with a day of reading.
3. Are paid sources (SCC Online, Manupatra) a partnership option, or out?
