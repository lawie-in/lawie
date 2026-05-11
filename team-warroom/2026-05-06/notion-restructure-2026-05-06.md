# Lawie Notion — Restructure Proposal
Owner: Kavya (PA) | For: Abhinav (Founder) | Date: 2026-05-06

## Principle
Solo human reader. Six top-level sections. No DB nested deeper than 2 levels. Every page answers "what do I read this for?" in its sub-line.

---

## 1. New tree (top-level = 6, max depth = 2)

```
Lawie HQ (workspace root)
│
├── 00 — Founder Desk                  [Abhinav's daily landing page]
│    ├── Today (auto-rolled daily digest, pinned)
│    ├── This Week (Mon plan + Fri KPI roll-up)
│    ├── Decide Queue (open decisions waiting on founder)
│    └── Inbox Triage (Kavya's draft replies for review)
│
├── 01 — Strategy & OKRs               [Why we are doing what we are doing]
│    ├── OKRs (DB)                     — quarterly objectives, Phase 1 / 2 / 3
│    ├── Phase 1 Tracker (page)        — 25 paying users in 90 days
│    ├── ICP & Positioning             — district court advocate, 0–5 yrs
│    └── Decisions Log (DB)            — every irreversible call, dated
│
├── 02 — Product & GTM                 [What we ship and how we sell it]
│    ├── Roadmap (DB)                  — features × phase × owner
│    ├── Templates Library              — 6 CLO-approved drafts (R4)
│    ├── Advocate Panel Reviews        — Jharkhand panel + future panels
│    ├── Pricing & Plans                — ₹799/mo, billing rules
│    └── Marketing & Content (Meera + Madhuri)
│
├── 03 — Engineering                   [How the product is built and run]
│    ├── Architecture                   — AWS diagram, system design
│    ├── Specs & ADRs (DB)             — replaces Confluence; one row = one spec
│    ├── Runbooks                       — deploy, rollback, incident
│    ├── Generation Log (DB)            — every Claude call, tokens, cost
│    └── Cost & Infra Tracker          — Vikram's daily AWS + Anthropic spend
│
├── 04 — Operations                    [Money, legal, people, risk]
│    ├── Action Items (DB)              — single source of TODOs across all agents
│    ├── Risks (DB)                     — top risks, owner, mitigation, status
│    ├── Finance                        — runway, MRR, Razorpay payouts
│    ├── Legal & Compliance (Ajay)      — advocate pack audit, T&Cs
│    └── HR & Hiring (Rita)             — when we go human-team
│
└── 05 — Archive                       [Cold storage, read-only]
     ├── Old meeting notes
     ├── Deprecated specs
     └── Pre-Phase-1 artifacts
```

Two-level rule: anything that wants to be a third level becomes a DB row with filtered views, not a sub-sub-page.

---

## 2. "What lives where" cheat sheet

| Section | Primary content | Who writes here | Cadence |
|---|---|---|---|
| 00 Founder Desk | Daily digest, decide queue, inbox | Kavya | Daily 08:30 IST |
| 01 Strategy & OKRs | OKRs, Phase 1 plan, decisions log | Abhinav + Priya | Weekly Mon, ad-hoc |
| 02 Product & GTM | Roadmap, templates, panel reviews, marketing | Priya, Ajay, Meera, Madhuri | Weekly + per release |
| 03 Engineering | Architecture, specs, ADRs, runbooks, gen log | Arjun, Vishal | Per spec / per deploy |
| 04 Operations | Actions, risks, finance, legal, HR | Vikram, Ajay, Rita, Kavya | Daily (actions), weekly (rest) |
| 05 Archive | Cold artifacts | Kavya (move-only) | When superseded |

---

## 3. Five surviving databases (the hard floor)

| DB | Lives in | Schema (key fields) |
|---|---|---|
| Decisions Log | 01 Strategy | Date, Decision, Context, Made by, Reversible? Y/N, Linked spec |
| Action Items | 04 Operations | Title, Owner, Due, Priority, Status, Linked decision/risk |
| Risks | 04 Operations | Risk, Likelihood, Impact, Owner, Mitigation, Status |
| OKRs | 01 Strategy | Objective, Key Result, Quarter, Owner, Score, Notes |
| Generation Log | 03 Engineering | Timestamp, Endpoint, Model, Input tok, Output tok, ₹ cost, User, Template |

Every other database either folds into one of these five or moves to Archive.

---

## 4. Where specific things go

- **AWS architecture diagram from Arjun** (`lawie-aws-architecture.md`, currently pending in /outputs/) → `03 Engineering / Architecture / AWS Architecture (v1)`. File as embedded markdown + PNG export. Linked from Decisions Log entry "Adopt AWS EC2 + Docker Compose stack".
- **Engineering specs (Confluence replacement)** → `03 Engineering / Specs & ADRs` DB. One row per spec. Required fields: Title, Status (Draft / In Review / Accepted / Superseded), Author, Decision link, Date. ADRs use the `engineering:architecture` template.
- **Helicone evaluation (Arjun)** → Specs & ADRs DB, status Draft. Decision flows into Decisions Log when picked.
- **Cost tracker (Vikram)** → `03 Engineering / Cost & Infra Tracker`, fed by Generation Log DB.
- **Advocate pack audit (Ajay)** → `04 Operations / Legal & Compliance`, with action items mirrored to Action Items DB.

---

## 5. Migration plan (one-time cleanup)

Assumed current chaos: multiple "decisions" pages, scattered meeting notes, redundant roadmap docs, half-built DBs.

| Step | What | Action | Owner |
|---|---|---|---|
| 1 | Freeze | Lock existing top-level pages read-only, banner: "Migrating — see Lawie HQ" | Kavya |
| 2 | Map | List every existing page/DB → target section in new tree | Kavya |
| 3 | Merge decisions | Consolidate all "decisions" pages into single Decisions Log DB; dedupe by date+title | Kavya, Abhinav reviews |
| 4 | Merge actions | Pull every TODO list / "next steps" block into Action Items DB | Kavya |
| 5 | Move specs | Any engineering doc → Specs & ADRs DB row, status = Accepted if shipped, Draft otherwise | Arjun |
| 6 | Meeting notes | Last 30 days → 00 Founder Desk / Archive of past digests; older → 05 Archive | Kavya |
| 7 | Templates | 6 CLO-approved → Templates Library, tagged R4-2026-05-06 | Ajay |
| 8 | Kill | Delete (not archive) any empty DB or "scratch" page with no inbound links | Kavya |
| 9 | Sign-off | Founder walks the tree, confirms he can find 5 random things in <10s | Abhinav |

Target: complete in 3 working days. Day 1 = freeze + map. Day 2 = merge + move. Day 3 = kill + sign-off.

---

## 6. Navigation aids (built once)

- **Pinned sidebar** = the 6 top-level sections, in order, with single-line purpose.
- **00 Founder Desk** is the home page. Default view on login.
- **Global search shortcut** documented on Founder Desk: `Cmd+P` → type DB name.
- **No emojis in section titles** — they break search and add visual noise.

---

Ready for next task.
