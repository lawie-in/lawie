# Lawie GTM — Phase 1 (first 25, then 100 paying advocates)

Owner: Meera (CMO). Drafted 11 Oct 2026 (night). Status: **draft, not for publishing**. Every public claim below goes to Ajay through Priya before it is final. Any offer or budget goes to Vikram.

## 0. Launch gate: when any of this goes public

Nothing in this plan is published until all of these hold:

1. **v1 is released to production** (T-403, founder) after **Anushka's PASS** on develop. Today every feature below is merged into `develop_staging` and waits for her run. Production (`main`) is older.
2. **T-227 is merged** (one price list: shown price = charged price) and **T-238 is merged** (pricing page fixed). Until then the live site shows a wrong price, so we drive no paid traffic to it.
3. **Ajay has signed every public line** in `calendar-*.md` and `copy/*.md`.

Before go-live we only build: the waitlist list, bar-association contacts, ambassador sign-ups, and content in the can. "Week 1" below means the week of go-live.

## 1. What is true today (the only things we promote)

Source: ticket files in `handoff/tickets/` on `develop_staging`, 11 Oct 2026.

| We can say | Basis |
| --- | --- |
| Drafting assistant for Indian advocates: you get a first draft to review, edit and download (Word, PDF) | Live flow; Ajay-approved steps in T-222 |
| More than 90 document types: bail applications (regular, anticipatory, before magistrate, interim, default, cancellation), legal notices, affidavits, petitions, family-court matters, agreements (rent, NDA, MOU, service, loan, employment) and more | 92 rule files, all on the free plan (Ajay's check, T-222) |
| Criminal drafts use BNS, BNSS and BSA | Ajay's wording, T-222 |
| Every draft carries: "Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing." | T-197 |
| 5 free Ink on sign-up. Most documents use 2 Ink; short ones (notices, affidavits, short applications, some simple agreements) use 1. A draft is charged only when it succeeds | T-227 (Vikram). **True only once T-227 merges** |
| Sign in with Google | Live |
| Drafts in English | FAQ; Hindi drafting is not released |

| We must NOT say (yet) | Why |
| --- | --- |
| Sign up with email and password | T-234 is To do. Allowed only as "coming soon" |
| "You see the price before you generate" | T-227 AC3 not built (waits for Rajesh) |
| Describe your matter in your own words / AI reads your FIR / image upload | Behind feature flags (describe-first, fact ledger), not on for users; T-301/T-304 not built |
| Blanks highlighted in exports | T-194 in progress |
| Works on your phone | T-138 not done; "work on mobile" is banned (T-141a) |
| Any court / your court's format / court-ready | T-140 not started; banned (T-141a) |
| Faster / under five minutes / saves X hours | Unsubstantiated (Ajay, T-222) |
| 500 templates | It is the aim, not today. Say "more than 90" |
| Hindi drafts | Only as "Hindi drafting: coming soon" |
| Accurate / guaranteed / 100% / replaces your advocate / legal advice / "get more clients" / "grow your practice" | Hard rules; BCI Rules Part VI Ch II r.36 |
| "Less than ₹16 per document" (live pricing page) | False at 2 Ink per document. Goes to Priya with T-238 |

## 2. ICP

**Primary: the district-court junior.** Advocate 0–7 years in practice, district and sessions court, Tier 2/3 city in the Hindi belt (Bihar, Jharkhand, UP first; then MP, Rajasthan, Delhi NCR district courts). Often drafts for a senior's chamber. Works off old files, typed formats and a local typist. Phone-first, WhatsApp all day, Hindi-speaking, drafts in English. Pays out of pocket; price-sensitive; ₹65–₹199 is an impulse spend, ₹799/month needs proof.

**Secondary: the small-chamber senior** (1–3 juniors) who wants first drafts off the typist's desk, and **final-year law students / fresh enrolees** (low pay, high word of mouth, future users).

**Jobs to be done:** a bail application tonight for tomorrow's listing; a legal notice for a client today; an affidavit or rent agreement without hunting for the old file. **Pains:** retyping old formats, new BNS/BNSS section numbers, typist queues. **Not our ICP in Phase 1:** corporate law firms, in-house teams, litigants (we never market to the public).

**Launch geography:** Patna (home base), Ranchi, Lucknow, then Varanasi, Prayagraj, Muzaffarpur, Gaya, Kanpur. Reason: the courts our rule packs were tested on (BR, JH, UP family-court numbering, Lucknow bench heading, Patna/High Court rules).

## 3. Positioning

**For** district-court advocates in India **who** draft the same applications and notices again and again, **Lawie is** a drafting assistant **that** gives you a first draft to review, edit and download, across more than 90 document types, with criminal drafts on BNS, BNSS and BSA. **Unlike** old files and typists, you start from a structured draft, not a blank page. **You stay in charge:** the advocate is responsible for legal accuracy and filing.

**One line (EN):** "Your first draft, ready to review."
**One line (HI):** "पहला ड्राफ्ट तैयार, आप बस जाँचें।"

## 4. Messaging pillars

| # | Pillar | Message | Proof we can show | Never say |
| --- | --- | --- | --- | --- |
| 1 | Start from a draft, not a blank page | Pick the document, answer a few questions, review the draft | Screen recording of the live flow | "court-ready", "in minutes" |
| 2 | Built for Indian courts' everyday work | Bail, notices, affidavits, petitions, agreements; criminal drafts on BNS, BNSS, BSA | Document list; BNS section visible in a sample draft | "any court", "validated" |
| 3 | You stay the advocate | Every draft says the advocate is responsible; edit everything; download Word or PDF | The disclaimer on screen; the editor | "accurate", "replaces", "legal advice" |
| 4 | Pay per draft, start free | 5 free Ink; 1 or 2 Ink per draft; charged only when the draft succeeds | Pricing page (after T-238) | Discounts not okayed by Vikram |

Tone: plain, respectful, peer-to-peer ("Advocate sahab" in Hindi only where natural). Hindi copy in Devanagari, everyday Hindi, legal terms in English where advocates use them (bail, FIR, affidavit, BNSS).

## 5. Channels (in priority order)

| Channel | Role | Phase 1 play | Rules |
| --- | --- | --- | --- |
| Bar associations (district) | Trust + demos | 1 live demo a week in a bar library or canteen, Patna → Ranchi → Lucknow. Printed one-pager with QR to sign-up. Ask the secretary for a slot; no payment to members | Demo the tool. Never offer client referrals; no endorsement claim by the association unless written |
| WhatsApp | Main conversion channel | (a) Lawie broadcast list (opt-in only, from demos and the site); (b) advocates sharing our 30-sec reel in their own groups. No cold adds, no spam to groups we are not in | Opt-in only (DPDP). 2 broadcasts a week max |
| Instagram + YouTube Shorts | Reach with juniors and students | 3 reels a week: "Draft this with me", BNS change explainers, chamber humour that stays respectful | No client stories; no case facts; sample matters are fictional and labelled |
| LinkedIn | Credibility, seniors, law-firm juniors, press | Founder + Lawie page: build notes, document-of-the-week, BNS/BNSS posts | No "grow your practice" |
| X | Legal Twitter, journalists | Short threads on BNS/BNSS section changes, product notes | Same |
| Law colleges | Pipeline + ambassadors | 10 ambassadors (final-year, Patna/Ranchi/Lucknow) run a "drafting lab" with a moot-style fictional matter | Students are users, not resellers; no payment per sign-up until Vikram sets it |
| Legal-news sites (LiveLaw, Bar & Bench, Lawctopus, regional Hindi legal portals) | Credibility + SEO | One sponsored newsletter slot or listing at launch; pitch a "BNSS drafting checklist" guest piece | Ads say "drafting tool", nothing more |

## 6. Funnel and KPIs

Funnel: reach → site visit → sign-up (5 free Ink) → **first draft generated** (activation) → second draft → **first payment** (top-up or plan).

| Stage | Target by day 30 (25 paid) | Target by day 90 (100 paid) | Assumed rate |
| --- | --- | --- | --- |
| Site visits | 5,000 | 20,000 | — |
| Sign-ups | 500 | 2,000 | 10% of visits |
| Activated (1st draft) | 300 | 1,200 | 60% of sign-ups |
| 2nd draft | 150 | 600 | 50% of activated |
| Paying advocates | 25 | 100 | ~8% of activated |

Weekly KPIs: sign-ups by source (UTM per channel, per bar association, per ambassador code); activation rate; time from sign-up to first draft; drafts per active user; paid conversion; CAC per paying advocate (target under ₹1,500 in Phase 1); demo-to-sign-up rate at bar demos (target 30%). Quality guardrails: refund requests, complaints about a wrong claim (target 0), Anushka/Ajay flags.

Tracking needs (to Priya as tickets, not built by marketing): UTM capture at sign-up; a signup-source field; an ambassador/referral code report. Analytics must carry no PII or document content (house rule).

## 7. Four-week launch calendar (Week 1 = go-live week)

**Pre-launch (now → go-live):** Ajay signs all copy; Rajesh finishes the one-pager, reel templates and pricing visuals; 3 reels shot; 10 ambassadors recruited; bar-association slots booked for Weeks 1–4; WhatsApp opt-in list from the waitlist form (if Priya tickets one); legal-news slot booked (Vikram okays spend).

| Week | Theme | Key actions | Output | Goal |
| --- | --- | --- | --- | --- |
| 1 | "Your first draft, ready to review" | Go-live posts on all channels; founder LinkedIn launch post; Patna Civil Court bar demo; WhatsApp broadcast #1 to opt-ins; reel 1 | Social calendar week 1 | 150 sign-ups, 5 paid |
| 2 | Bail and BNSS | Reel 2 (bail application walkthrough, fictional matter); BNSS explainer carousel; Ranchi bar demo; law-college lab #1 (Patna) | Social calendar week 2 | 300 sign-ups, 12 paid |
| 3 | Notices and agreements (1-Ink documents) | Reel 3 (legal notice); legal-news sponsored slot; Lucknow bar demo; lab #2 (Lucknow) | Reuse winning week 1–2 formats | 420 sign-ups, 19 paid |
| 4 | "You stay the advocate" + review | Founder AMA on LinkedIn/X; ambassador push; lab #3 (Ranchi); review KPIs, cut weak channels, plan days 31–90 | Phase 1 report | 500 sign-ups, 25 paid |

## 8. Budget asks for Vikram (4 weeks, ₹, all pending his okay)

| Item | Ask | Note |
| --- | --- | --- |
| Paid social (Instagram/YouTube boosts of the best reel; targeting Bihar, Jharkhand, UP; law/advocate interests) | 30,000 | Only after go-live and T-238 merged |
| LinkedIn boosts (launch post, 2 posts) | 10,000 | |
| Legal-news sponsored newsletter or listing (one slot) | 25,000 | Quote first; pick one site |
| Bar demos: printing (one-pagers, standees), tea, travel Patna–Ranchi–Lucknow | 30,000 | No payment or gifts to association members |
| Law-college labs: venue, snacks, certificates | 12,000 | |
| Ambassador stipends (10 × ₹1,500, flat, not per sign-up) | 15,000 | Vikram decides any per-sign-up reward |
| Reel editing (freelance, 6 reels) | 15,000 | |
| Tools: Canva Pro, WhatsApp Business API provider, scheduling | 8,000 | |
| **Total** | **1,45,000** | Target CAC under ₹1,500 at 100 paid |

**Offers needing Vikram's okay (none is used in copy until he says yes):** (a) launch top-up bonus for bar-demo attendees; (b) ambassador code that gives the new user extra Ink; (c) first-month price on Solo. Default if he says no: the standard 5 free Ink only.

## 9. Open items (to Priya)

1. Ajay: sign every line in `calendar-*.md` and `copy/*.md`; confirm "more than 90 document types" and "drafts in English" as true today.
2. Vikram: plan prices (Solo ₹799, Pro ₹1,999, top-ups ₹65/₹199/₹499) are on the live page but not in T-227. Confirm them before any ad shows a rupee figure. Okay or refuse the budget and offers above.
3. Pricing page fixes beyond T-238: "Less than ₹16 per document on Solo" is false at 2 Ink; FAQ "Each document you generate uses 1 Ink" (same line T-238 names). Copy in `copy/pricing.md`.
4. Tickets for tracking: UTM + signup source; waitlist/opt-in form before go-live.
5. When T-234 merges, swap "coming soon" for email and password sign-up; when T-227 AC3 ships, add "you see the cost before you generate".
