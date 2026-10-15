# Drafting v2 — High-level design

## 1. Components

```mermaid
flowchart LR
  subgraph Admin["Admin panel (web, admin role)"]
    A1[Sources: upload, metadata, licence]
    A2[Kinds & Parts editor + sign-off]
    A3[Eval dashboard: blank rate, citation misses, golden runs]
  end
  subgraph Library["Law Library (drafting service + Atlas)"]
    L1[Ingestion pipeline]
    L2[(Sources / Provisions / Judgments / Passages)]
    L3[Authority Graph: amends, overrules, interprets]
    L4[Retrieval: lookup, BM25, vector]
  end
  subgraph Compiler["Document Compiler (drafting service)"]
    C0[Intake + Fact Ledger  (exists)]
    C1[Plan: kind, parts, authority needs]
    C2[Retrieve: as-of, forum, jurisdiction]
    C3[Draft: part by part, authority ids required]
    C4[Verify: facts, authority, quotes, dates]
    C5[Repair loop, bounded]
    C6[Render + Provenance]
  end
  A1 --> L1 --> L2 --> L3 --> L4
  A2 --> C1
  C0 --> C1 --> C2 --> C3 --> C4 --> C5 --> C3
  C4 --> C6
  L4 --> C2
  L4 --> C4
  C6 --> A3
```

## 2. The three inputs of a draft

| Input | Where it lives | Who owns it | Verified by |
|---|---|---|---|
| Facts | Fact Ledger (per intake) | the advocate | D1 verifier (exists) |
| Structure and rules | Document Grammar: Kind → Parts → Rules | Ajay (signature), admin (composition) | schema validation at save; sign-off state at run |
| Law | Law Library: Sources → Provisions / Judgments → Passages, with validity windows and status | founder (licence, upload), Ajay (status) | Verifier: id resolves, as-of date valid, quote matches |

## 3. The compile pipeline, one draft

1. **Plan** (small model, JSON only). Input: ledger summary, kind (chosen by the user or by the brief), forum, dates. Output: the parts to produce, in order, and for each part the *authority needs* as structured queries: `{type: "provision", act: "BNSS", section: "480", asOf: "<fir date>"}`, `{type: "judgment", issue: "bail parity", court: "SC|HC:Patna", limit: 3}`. The plan never contains law text.
2. **Retrieve** (no model). Each need becomes a library query. Provisions: exact lookup by act + section + as-of date (+ old/new law mapping). Judgments and commentary: BM25 + (phase 2) vector, filtered by court, date, good-law status, jurisdiction; top-k passages with ids. The result is a **Context Pack**: facts (ledger ids) + passages (authority ids), with a token budget per part.
3. **Draft** (drafting model, one call per part or per group of small parts). The system prompt is the part's signed rules; the user turn is the context pack. Output format: text where every legal proposition ends with `⟦auth:<id>⟧` and every fact-bearing clause with `⟦fact:<id>⟧`. No markers, no sentence.
4. **Verify** (no model, then one model). Deterministic checks: every marker resolves; every `auth` passage is valid as-of the part's date and jurisdiction; quoted spans (inside quotes) match the passage byte-for-byte after whitespace normalisation; facts match the ledger (today's D1); numbers and dates consistent across parts; forbidden content per part rules (e.g. no case law in default bail unless given). Then a **judge** pass (cheap model) flags unsupported propositions that carry no marker — anything legal-sounding without an id.
5. **Repair** (bounded, 2 rounds). Failed sentences go back to the drafting model with the failure reason and the same context pack; a sentence still failing becomes the signed blank or is dropped per the part rule.
6. **Render + Provenance.** Markers are stripped from the text and stored as a provenance map (sentence → ids). The editor shows citations on hover; the PDF prints the court format; an optional authority appendix lists the passages used, under the licence's display policy.

## 4. Why hallucination falls

- The model is not asked to know law; it is asked to use passages. Prompts forbid unsourced law; the verifier catches what the prompt does not.
- Section retrieval is exact, so "Section 480(1) BNSS" is either in the pack or the sentence cannot be written.
- Judgments the model "remembers" but that are not in the library cannot be cited (no id) — they become blanks with a "verify this authority" note, which is what a careful junior would hand a senior.
- Dates are structural: the as-of date flows from the ledger into retrieval, so the wrong version of a section is not retrievable.
- Every draft records the exact passage versions used, so a later library change can find affected drafts.

## 5. Where today's 92 go

Each pack becomes a **Kind** record: its skeleton paragraphs become signed **Part** instances; its prompt_context lines become part rules; its court-rules become the forum format. Nothing is re-signed if the text is unchanged (byte check against the signed file, as T-116 does). A per-kind switch (`kinds.<id>.engine = v1 | v2`) lets us move one kind at a time and compare on the golden set.

## 6. What the advocate sees

- The same flow. Plus: a provenance sidebar ("this paragraph: your facts #3, #7; BNSS s.480(1) as on 12 Aug 2026; Sanjay Chandra v CBI (SC 2011) — good law as of 1 Oct 2026"), blanks marked and explained, and a one-click "sources used" list. That sidebar is the feature that makes a lawyer trust the draft.
