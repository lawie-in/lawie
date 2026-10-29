# Lawie marketing: tools, workflows, automation and ideas (Meera, 29 Oct 2026)

Status: proposal for the founder. Nothing here changes a signed rule. Every public claim still goes to Ajay; every rupee still goes to Vikram; code changes go to a dev lead through Priya as tickets. Cash is ₹0 (Vikram, 15 Oct); paid restarts only from revenue (≤20% of last month's net, CAC ≤ ₹2,000). Nothing is public before T-403 and Anushka's PASS.

## 0. The three facts that shape everything

1. **BCI Rule 36.** Advocates may not advertise or solicit. In March 2025 the BCI also sent cease-and-desist notices to online platforms and told State Bar Councils to act. So Lawie must never look like a lawyer-finder, a lead seller, or a megaphone for an advocate's practice. We market a drafting tool to advocates, full stop. No "find an advocate", no advocate testimonials that read as adverts for their services, no "verified advocate" badges, no paying anyone per client. This is a moat as much as a limit: the big legal-tech money in India went into directories, which is exactly where the BCI hit.
2. **The incumbent is the typist and the old file,** not another app. Our competitor is a ₹50 typing job at the court complex. Messaging stays "start from a draft, not a blank page", never "faster than your typist" (a speed claim, and unkind).
3. **We already own the strongest free asset: the tools at lawie.in/tools** (bail-checker, section-converter, timeline-tracker live; two more behind a flag, T-375). The BNS/IPC section converter is the single best search magnet we have, because every advocate in India is relearning section numbers right now. Jurigram already runs 43 calculators and a BNS↔IPC tool, so we have to be better on the page, not just present.

## 1. Tool stack (₹0 unless marked)

| Job | Tool | Cost | Note |
| --- | --- | --- | --- |
| Web analytics | GA4 (live, consent-gated, public pages only) | ₹0 | Sign-ups counted from our own data by utm_source/campaign (T-623 adds a page) |
| Search | Google Search Console + Bing Webmaster Tools + IndexNow | ₹0 | Not set up yet (I found no sitemap, robots.txt, OG image or metadataBase in apps/web). Ticket needed |
| Keyword data | Google Keyword Planner (needs the Ads account, no spend), GSC queries | ₹0 | No Ahrefs/Semrush until revenue |
| Social scheduling | Buffer free (3 channels, 10 queued) or native scheduling on LinkedIn/Instagram | ₹0 | Posts are pre-signed by Ajay; scheduling only moves signed text |
| Design | Canva free + Rajesh's design-notes.md | ₹0 | No Figma (no subscription) |
| Video | Phone screen recording + CapCut/free editor | ₹0 | Fictional matters only |
| WhatsApp | WhatsApp Business app, broadcast lists, opt-in only | ₹0 | List owner Madhuri; STOP within 24 h; opt-in record per number. API tier only after revenue |
| Email | Our own email-worker (exists) | ₹0 | Drip copy goes through Ajay like any other email |
| Automation | GitHub Actions cron (we already run CI) for reports; Make free tier (1,000 ops/month) only if a cross-app glue is needed | ₹0 | No Zapier (100 tasks), no self-hosted n8n (VPS cost) |
| Listening | Google Alerts ("Lawie", "lawie.in", "BNS section converter"), manual reads of LiveLaw/Bar & Bench Telegram | ₹0 | |
| Copy safety | A `claims-lint` script: greps handoff/marketing and handoff/copy for banned words (guaranteed, verified, court-ready, 100%, replaces, fastest, time-saved numbers) and fails the commit | ₹0 | Ticket for a dev lead; reuses scripts/__tests__ (T-593) |
| Link tracking | UTM sheet in handoff/marketing/utm-sheet.md (source per channel, campaign per piece) | ₹0 | The app keeps source, medium, campaign |
| Later (from revenue) | Ahrefs Lite or Semrush, WhatsApp Business API, Buffer paid, one paid reel at ₹500/day | ₹ | Vikram's 20% rule |

## 2. Channels, in order of expected return

### 2.1 Search (the long game, and the only one that compounds)
- **Fix the plumbing first (one ticket):** sitemap.xml, robots.txt, metadataBase, canonical URLs, Open Graph + Twitter card image per page, FAQPage and SoftwareApplication JSON-LD, an `llms.txt`. Submit to GSC and Bing; enable IndexNow. Without this, nothing below ranks.
- **Programmatic tool pages (the engine):** one page per section pair in the BNS/IPC converter (`/tools/section-converter/ipc-420-to-bns`), one per BNSS/CrPC pair, one per limitation period in the timeline tracker, one per bail type in the bail checker. Each page: the answer in the first line, a question-style H2 ("What is IPC 420 under BNS?"), the tool embedded, and the one-line disclaimer. Legal content, so Ajay signs the template and spot-checks pages; the data is generated from the same JSON the tool already uses, so it cannot drift from the product. Target: 500+ indexable pages from three data files. This is how Vakilsearch/Zolvit built traffic: content-first.
- **Question pages (GEO as well as SEO):** 30 pages answering what advocates actually type: "bail application format", "anticipatory bail application format", "legal notice format section 138", "temporary injunction application format O.39". Each shows the structure of the document (headings only, no legal advice), a fictional example, and "draft this with Lawie". AI engines (ChatGPT, Perplexity, Google AI Overviews) cite pages with a summary up top, question headings and FAQPage schema; that is the whole GEO checklist, and it costs nothing extra.
- **Hindi pages:** the same question pages in Hindi (`/hi/...`), because the district-court junior searches in Hindi on a phone. Hindi legal SEO is nearly empty space.
- **Earned links:** pitch LiveLaw, Bar & Bench and the eCourtsIndia blog (which already runs a 2026 legal-tech directory) a product note, not an advert. Offer the section converter as a free embed to law-college websites and bar-association sites (a link each).

### 2.2 Founder-led social (LinkedIn first, then YouTube Shorts)
- The founder is the channel. 3 posts a week, Madhuri drafts, Ajay checks claims, founder posts in his own voice. Formats that work for this audience: "one section, one change" (BNS vs IPC), "what a first draft looks like" (fictional, screenshot), "what I learnt at the Patna bar demo".
- YouTube Shorts and Instagram Reels of the same 30-second screen recording (R1–R4 in reels.md). 58% of Indians use YouTube for news; juniors watch law channels on it. Post the same clip to WhatsApp Status.
- Post timing: 6–8 pm, after cause lists are out and before dinner; and 8–9 am before court.
- X stays low-effort (link-card rule in the calendar).

### 2.3 WhatsApp (the conversion channel)
- Opt-in only, from demos and the site form. Two broadcasts a week at most. Every broadcast is one useful thing (a section change, a new tool page, a 20-second clip), never "buy now".
- **"Office hours" group, invite-only, 50 people:** the founder answers product questions on Tuesday evenings. Not legal questions. Priya moderates; Ajay's rules pinned.

### 2.4 In person (Patna first)
- Bar-association demos (20 minutes, phone, fictional matter), law-college labs. Already in the organic plan. Add: a **one-page A5 "how to start" card with a QR and the founder's referral code**, left with the bar-room librarian or notice board with permission. Print cost under ₹500; Vikram okays.
- **Court-complex typists:** they are the incumbent and also the best distributors. Idea to test with Vikram and Ajay before anything: a typist who uses Lawie for advocates' drafts is a user, not a referrer; give them the same referral Ink as anyone. No cash per sign-up to anyone, ever.

### 2.5 Product-led (the cheapest growth)
- Referral codes (+5/+3 Ink) are built. Put the code on the dashboard empty state and in the welcome email.
- **"Shared format" pages:** an advocate can share a blank, de-identified structure of a document type (headings only) as a public page with their referral code. No client content ever leaves the account. Needs Ajay's view and a ticket.
- Milestone nudge at the 5th draft: "Know a junior who drafts like this? Your code gives them 5 Ink."

### 2.6 Community and partners
- Law-college moot and legal-aid societies: a free lab, students get 5 Ink like anyone; no special offer without Vikram.
- District Legal Services Authority panel advocates: a demo through the bar, never a direct approach.
- Legal-news Telegram channels (LiveLaw 38k, others): share tool pages when they are useful to the day's news (a new BNSS ruling → the converter page for that section). Never paid, never spammy.

## 3. Workflows

**A. Content, every week (Mon–Fri):**
1. Mon: Madhuri drafts 3 posts + 1 WhatsApp + 1 tool/question page from the content queue (`handoff/marketing/content-queue.md`, status per item: idea → drafted → Ajay → signed → scheduled → live → measured).
2. Tue: Ajay signs or sends back (one message, line numbers).
3. Wed: Rajesh makes the visual in Canva from design-notes.md; founder records any clip.
4. Thu: schedule in Buffer/native with UTMs from the sheet; WhatsApp broadcast queued.
5. Fri: measure last week (GSC clicks, sign-ups by utm_source, WhatsApp replies/STOPs), write 5 lines in `handoff/marketing/weekly.md`, pick next week's topics from what moved.

**B. Programmatic pages (one-off build, then automatic):** dev lead builds the page template once from the tool JSON; a GitHub Actions job rebuilds and pings IndexNow on every data change; Ajay signs the template and a random 10 pages; I spot-check 5 a month.

**C. Automation that runs itself (GitHub Actions cron, ₹0):**
- Weekly GSC + Bing export → `handoff/marketing/weekly-search.md` (clicks, impressions, top queries, new pages indexed).
- Weekly sign-ups by utm_source from the admin API (counts only, T-242/T-623) → the same file.
- `claims-lint` on every commit touching marketing or copy.
- Google Alerts → the founder's inbox (no code).
- Broken-link check on lawie.in nightly.

**D. Review loop:** Friday numbers → Monday topics. Kill any format that gets no sign-ups in 3 weeks. Double any that does.

## 4. Out-of-the-box ideas (each needs Ajay before it exists in public)

1. **"Section of the day" bot in our own WhatsApp broadcast and on LinkedIn:** one IPC→BNS mapping a day with the converter link. 365 pieces of content from one data file. Hindi and English.
2. **The Blank Page Clock:** a public page that shows a live count of first drafts started on Lawie this week (counts only, no content). Social proof without a testimonial. Needs Arjun (number is real) and Ajay (wording).
3. **"Draft anatomy" posters:** a one-page visual of what goes in a bail application (headings and order only), free PDF, with the disclaimer. Advocates pin these in chambers. Link + QR to the tool. Printed by request at demos.
4. **Bar-association "typing room" day:** a table in the bar room for one morning; juniors bring a matter they already know and try one draft on the founder's laptop. 30 sign-ups a morning is realistic from demo-to-sign-up at 30%.
5. **Hindi-first:** the first Indian legal drafting tool to market in Hindi on purpose. The toggle exists on the landing page; make the Hindi question pages and reels the default in Bihar, UP, MP, Rajasthan.
6. **"What changed" explainers tied to news:** when a High Court rules on a BNSS section, publish the converter page for that section the same day with a one-line note. Timeliness earns the Telegram shares.
7. **Teach the typists:** a free 30-minute session for court-complex typists on using Lawie for advocates' drafts. They become users; advocates see it on their screens.
8. **GEO on purpose:** add FAQPage schema and an answer-first paragraph to every tool and question page, plus `llms.txt`, so "bail application format India" in ChatGPT or Perplexity cites lawie.in. Track monthly by asking the same 20 questions to each engine and logging citations.
9. **Student "Draft Lab" badge:** law-college societies that run a Lawie lab get a page on lawie.in listing the society (not individuals). Free, and a backlink from the college site.
10. **Open the data, keep the product:** publish the BNS↔IPC mapping as a free CSV/JSON download under a permissive licence with attribution. Developers and law bloggers link to it; the tool page ranks for it.

## 5. What I need from others

| Who | What |
| --- | --- |
| Priya | Tickets: SEO plumbing (sitemap, robots, OG, metadataBase, JSON-LD, llms.txt); programmatic tool pages from tool JSON; claims-lint script; referral code on empty state and welcome email; "shared format" page (after Ajay); weekly GSC/sign-ups report action |
| Ajay | Sign: the tool-page template, 30 question pages, "Section of the day" format, draft-anatomy poster, the typist idea, the Blank Page Clock wording |
| Vikram | Okay: ₹500 print run; typist session (₹0); the 20% rule applied monthly from the first revenue |
| Arjun | Confirm: the drafts-started counter is a true count; GitHub Actions cron for reports is fine; IndexNow key handling |
| Rajesh | Canva templates for the 5 post formats; the A5 card; the draft-anatomy poster |
| Founder | 8–10 hours a week: 3 posts, 1 demo, 1 WhatsApp office hour; records one clip a week |

## 6. Targets (guesses until Week 2 data)

| Metric | Month 1 | Month 3 | Month 6 |
| --- | --- | --- | --- |
| Indexed pages | 50 | 500 | 800 |
| Organic clicks / month | 300 | 3,000 | 10,000 |
| Sign-ups / month | 150–400 | 600 | 1,200 |
| Paying (4%) | 5–8 | 24 | 48 |
| Cost | ₹0 | ₹0 | ≤20% of month-5 net revenue |

Floor is my organic plan; target is Vikram's Conservative case. Week 2 numbers replace all of this.

## Sources read for this plan (29 Oct 2026)
BCI March 2025 notices and Rule 36 coverage (MediaNama, Lexology, PIB); LawRato/Vakilsearch/SoOLEGAL go-to-market notes (Daksh, Inc42, eCourtsIndia 2026 directory); Jurigram's 43-calculator tools hub; programmatic-SEO tool guides; Zapier/Make/n8n 2026 free tiers; GEO checklists (Superlines, LLMPulse); Reuters Institute Digital News Report 2026 (India: ~58% use YouTube for news); Telegram law-channel sizes (LiveLaw ~38.8k). None of these measured advocate behaviour directly; the Patna numbers come from our own demos.
