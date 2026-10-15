# ADR-026 — Drafting v2: the Law Library and the Document Compiler

Arjun, 15 Oct 2026. Status: **proposed**, for the founder's decision (D1–D9 below). Ajay's legal constraints are being collected in `handoff/legal/drafting-v2-constraints-ajay.md`; where they land they override the defaults here.

Founder's ask (15 Oct): "92 templates is ok but there can be n number of types of documents. Drafting should be rock solid to handle any situation with minimal hallucination. Why can't we have a law database from where our drafting agent takes the context — judgements, cases, books. I will get the license and add the books; context files added from the admin panel; indexed for retrieval on the go. Solid architecture, out of the box, unique and accurate. Also everything is too complex, for example the Ink credits."

## 1. The idea in one paragraph

Stop treating a draft as a filled template. Treat it as a **compiled artifact**: the output of a small compiler whose inputs are (a) the **Fact Ledger** (what the advocate told us, already verified — exists today), (b) a **Document Grammar** (what parts a document of this kind has and what each part may say — replaces the 92 templates with ~40 reusable part types), and (c) the **Law Library** (every statute, rule, judgment, form and commentary the founder licenses, versioned and date-aware, queried through an **Authority Graph**). The model's job is reduced to *assembly*: it writes each part from the facts and the retrieved authority passages it is given, and **every legal proposition it writes must carry an authority id that resolves to a passage in our library as of the relevant date**. A deterministic **Verifier** rejects anything else, and what cannot be supported becomes a signed `[To be confirmed: …]` blank instead of a confident sentence. The advocate sees, for every sentence, where it came from. That is the product: not "AI wrote my petition" but "every line of my petition is traceable to my facts or to the law, with the source one click away".

Why this is unique: competitors either fill templates (safe, narrow) or let the model free-write with retrieval (broad, hallucinates). The compiler stance makes the broad path safe: breadth comes from the grammar and the library, safety from "no authority id, no sentence". It also compounds: every licensed source the founder adds makes every document kind better the same day, with no code.

## 2. What we keep (it already works)

- The one flow: describe → brief → ledger → confirm → draft (ADR-021).
- The **Fact Ledger** with sources (`user`, `asked`, `computed`, soon `upload`) and the D1 **verifier** ("nothing the ledger does not hold"). Drafting v2 generalises the verifier to authority, it does not replace it.
- Ajay's **signed skeletons and rules** per document kind. They become the signed form of grammar parts.
- The **law switch** (IPC/CrPC vs BNS/BNSS by date, T-245a). It becomes the general "as-of date" rule of the library.
- The **golden set** and Anushka's gate. They become the regression harness per document kind.
- Direct Anthropic calls, admin-configured models and rates, prompt caching.

## 3. Decisions for the founder

| # | Decision | Recommendation |
|---|---|---|
| D1 | Build the Law Library as a first-class system (sources, versions, as-of dates, authority graph) with admin upload and re-index | Yes. This is the moat. |
| D2 | Replace per-document templates with a compositional Document Grammar (parts + rules + forum format); the 92 become grammar instances, new kinds need no code | Yes, migrated kind by kind behind a switch; the 92 keep working throughout. |
| D3 | Hallucination policy: a legal proposition without a resolving authority id is never printed; it becomes a signed blank or is dropped; the draft shows provenance per sentence | Yes. Non-negotiable; Ajay signs the blank wording. |
| D4 | Storage: MongoDB Atlas for documents, Atlas Search (BM25) + Atlas Vector Search for retrieval, no separate vector DB | Yes. One vendor we already run; needs M10+ (approved). |
| D5 | Embeddings: phase 1 none (structured + BM25 retrieval is exact for statutes and rules); phase 2 add a legal-domain embedding model for judgments and commentary (Voyage `voyage-law-2` is the only legal-tuned one on the market; founder's key, read-only, low limit) | Phase 1 now; phase 2 after the first 50 judgments are in and we can measure recall. |
| D6 | Judgment "good law" status is data in the library (overruled / distinguished / referred), set by Ajay or an admin with a source, never inferred by the model | Yes. |
| D7 | Admin panel owns sources, kinds, parts, sign-off state and evaluation dashboards; nothing legal lives only in code | Yes. |
| D8 | Ink v2: one balance, one ledger, three operations, size-class pricing; no drip logic, no carry, no second bucket visible | Yes, after v1 (`06-ink-v2.md`). |
| D9 | Sequencing: v1 ships as is; v2 phases start after Anushka's PASS, phase 0 first (library + citation check inside today's flow) | Yes. |

## 4. Principles (the ones that keep it simple)

1. **The model recalls nothing.** It receives facts and passages; it may not state law it was not given. Prompts say so; the verifier enforces it.
2. **Everything is versioned and dated.** A section, a rule, a judgment's status, a part's wording — each has a validity window; every draft records which versions it used.
3. **One grammar, many kinds.** A kind is data: a list of parts, each with a schema, rules and a forum format. Adding a kind is an admin action plus Ajay's signature on new rules.
4. **Provenance is the product.** Every sentence maps to ledger fact ids and/or authority ids. The UI shows it; the PDF can print an authority appendix.
5. **Deterministic before probabilistic.** Section retrieval by number, date and jurisdiction is a lookup, not a similarity search. Similarity search is for judgments and commentary only.
6. **Nothing legal lives only in code.** Rules, parts, blank wording and citation formats are library records with a signature, visible in admin.
7. **Fail to a blank, never to a guess.**

## 5. Phases (each ships something a user feels)

- **Phase 0 — Library + citation check (4–5 weeks after v1).** Sources, ingestion, admin upload, provision lookup. Wire into today's packs: every section the model cites is checked against the library and the as-of date; a miss becomes a blank. Immediate hallucination cut with no change to the 92 kinds.
- **Phase 1 — Grammar + compiler (6–8 weeks).** Parts, kinds, plan → retrieve → draft → verify → repair. Migrate the six bail packs first (they have signed skeletons and the law switch), then the rest, kind by kind behind a per-kind switch.
- **Phase 2 — Open kinds + judgments (6 weeks).** Admin creates kinds from parts; judgment ingestion with good-law status; vector retrieval for judgments and commentary; provenance view in the editor.
- **Phase 3 — Scale and learn (ongoing).** Per-kind golden sets grown from approved drafts; recall measurement; worker pool for ingestion; M30 when needed.

## 6. Cost and scale, honestly

- Per draft: retrieval adds ~6–10k input tokens of passages. On Sonnet 5.5 that is ≈ ₹1–2 per draft on top of today's ≈ ₹5 (post model switch). Fine.
- Library: 10,000 provisions ≈ 10k documents; 50,000 judgments ≈ 2–5M chunks. Atlas M10 handles the first year; M30 (~₹25k/mo) at the judgment scale. Embeddings at $0.12/MTok ≈ one-off ₹5–15k for 50k judgments.
- Throughput: the compiler is a queue of stages (BullMQ exists); each stage stateless; 10,000 drafts/day is ~7/min, two drafting workers.

## 7. Risks

- Licence terms may forbid storing or displaying full text of some sources — the library records licence per source and the UI respects a `displayPolicy` (quote / cite-only / internal).
- Good-law status is only as good as its maintenance — hence D6 and a visible "status last reviewed" date on every judgment used.
- Over-blanking: too many `[To be confirmed]` blanks make a draft useless. Measured per kind (blank rate) and tuned by adding sources, not by loosening the verifier.
- Scope creep: the grammar must stay small (~40 part types). New part types need my sign-off.

Related: `01-hld.md`, `02-system-design.md`, `03-database-design.md`, `04-lld-drafting-pipeline.md`, `05-law-library-and-admin.md`, `06-ink-v2.md`.
