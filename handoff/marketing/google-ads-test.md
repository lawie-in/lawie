# Google Ads search test (Meera, 26 Oct 2026)

Status: DRAFT. Not running. Needs (1) Vikram's okay on the spend, (2) Ajay's sign-off on the ad copy, (3) the founder's cash decision. Gates unchanged: T-403, Anushka's PASS. Founder asked for this test on 26 Oct. Every number is a guess until we have data.

## The test

| Item | Value |
| --- | --- |
| Type | Google Ads Search only. Search partners off. No Display, no video, no Performance Max |
| Budget | ₹500 a day. Round A: 5 days, ₹2,500. Round B (another 5 days, ₹2,500) only if Round A passes Vikram's gate below. ₹5,000 hard cap |
| Bidding | Manual CPC, max CPC ₹40. No automated bidding in the test |
| Language | English. Hindi ads in round 2 after Ajay reads the Hindi |
| Locations | Bihar, Jharkhand, Uttar Pradesh, Madhya Pradesh, Rajasthan, Delhi NCR (the district-court junior ICP) |
| Landing page | The Lawie landing page, with manual UTMs: utm_source=google-format or google-software (the existing count-by-source then splits by ad group; Priya, 26 Oct), utm_medium=cpc, utm_campaign=search-test-oct26-format (ad group 1) or search-test-oct26-software (ad group 2). The app keeps only source, medium and campaign (100 characters each), so the ad group goes in utm_campaign. utm_term and gclid are not kept |
| Goal | Sign-ups, counted from our own accounts data by utm_campaign. There is no GA sign-up event today (Priya checked the code, 26 Oct), so no conversion is set up in Google Ads. Clicks and cost come from Ads |
| Rule | Blended CAC (spend ÷ new paying users) at or under ₹2,000 (Vikram) |
| Stop rule | Vikram's gate (section below) replaces my 3% rule: after ₹2,500, continue only if cost per verified sign-up is ₹250 or less. 3% of clicks stays as a floor. Report each ad group separately |

## Keywords (phrase match; exact match for the first two)

- [bail application format], [legal notice format]
- "bail application draft", "anticipatory bail application", "draft legal notice online", "affidavit format", "legal drafting software", "legal drafting software for advocates", "ai legal drafting india"

Negative keywords (phrase): lawyer near me, advocate near me, hire, consultation, free legal advice, jobs, course, internship, salary, college, exam. Reason: we sell a tool to advocates. We never sell an advocate's services or invite clients.

## Responsive search ad (EN). Ajay signs every line

Headlines (30 characters max each; counts in brackets):
1. Lawie: Drafting for Advocates (29)
2. Start with 5 free Ink (21)
3. First Draft, You Review It (26)
4. Bail Application Draft (22)
5. Legal Notice Draft (18)
6. You Stay the Advocate (21)
7. Solo Plan ₹799 a Month (22)
8. Describe It, Get a Draft (24)

Descriptions (90 characters max each):
1. Describe your matter in plain words. Lawie writes a first draft. You review and edit it. (88)
2. Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing. (89) [Ajay's exact disclaimer]
3. Start with 5 free Ink once you verify your email. Solo plan ₹799 a month, 50 Ink. (81)

Not used on purpose: any outcome, speed or accuracy claim, "court-ready", "guaranteed", "best", "lawyer", "consultation", case names, section numbers, Pro, yearly, discounts. Prices include GST on the page; Ajay to say if the ad must say so too.

## For Ajay
- Sign every headline and description above.
- "free Ink" appears only with "5 Ink", as T-398 allows.
- Ad-policy check for legal terms is Google's; the account owner sees any disapproval.

## For Vikram
- ₹5,000 test, 10 days, hard cap. Okay, or a smaller cap.
- Where the money comes from is the founder's call.

## Prompt for a browser agent (build it paused; never enable it)

Paste the block below into a browser agent that is already signed in to the founder's Google Ads account.

```
You are setting up ONE Google Ads Search campaign, saved as PAUSED. Do not enable it. Do not enter or change any payment, billing or card details. If billing is not set up, stop and tell me.

Rules:
- Use ONLY the text below. Do not add, reword or "improve" any keyword, headline or description. Do not accept any Google recommendation, auto-applied recommendation, broad match, budget increase or "optimised" setting. Turn off auto-apply.
- Do not install any new tag or edit the website. Do not set up any conversion tracking, and do not link or import anything from GA4. Do not change the auto-tagging setting.
- Change nothing else in the account.
- If a screen is unclear or asks something not covered here, stop and ask me.

Campaign:
- Type: Search. Goal: Website traffic. Name: search-test-oct26.
- Networks: Google Search only. Turn OFF Search partners and Display network.
- Locations: Bihar, Jharkhand, Uttar Pradesh, Madhya Pradesh, Rajasthan, Delhi. Presence only (people in the location).
- Language: English.
- Budget: INR 500 per day. Start date: the day I tell you. End date: 5 days after the start (Round A). I will ask you to extend it only after the Round A check.
- Bidding: Manual CPC, max CPC INR 40. Enhanced CPC off.
- Ad group 1 "format-draft". Keywords: [bail application format] [legal notice format] "bail application draft" "anticipatory bail application" "draft legal notice online" "affidavit format"
- Ad group 2 "software". Keywords: "legal drafting software" "legal drafting software for advocates" "ai legal drafting india"
- Negative keywords (campaign level, phrase match): lawyer near me, advocate near me, hire, consultation, free legal advice, jobs, course, internship, salary, college, exam
- One Responsive Search Ad per ad group, same text. Final URL, ad group 1: {LANDING_URL}/?utm_source=google-format&utm_medium=cpc&utm_campaign=search-test-oct26-format . Final URL, ad group 2: {LANDING_URL}/?utm_source=google-software&utm_medium=cpc&utm_campaign=search-test-oct26-software
  Headlines: 1) Lawie: Drafting for Advocates 2) Start with 5 free Ink 3) First Draft, You Review It 4) Bail Application Draft 5) Legal Notice Draft 6) You Stay the Advocate 7) Solo Plan ₹799 a Month 8) Describe It, Get a Draft
  Descriptions: 1) Describe your matter in plain words. Lawie writes a first draft. You review and edit it. 2) Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing. 3) Start with 5 free Ink once you verify your email. Solo plan ₹799 a month, 50 Ink.
- Do not pin headlines. Do not add images, sitelinks, callouts or call extensions.

When done: leave the campaign PAUSED, then send me a screenshot or text list of every setting above as saved, plus anything Google flagged or disapproved. Do not click Enable.
```

Before anyone enables it: Vikram okays the spend, Ajay signs the copy, the founder confirms the cash. Priya has confirmed the landing page keeps utm_source, utm_medium and utm_campaign on the account at sign-up. A sign-up report by utm_campaign (and, later, paying users by campaign) must be ready before day 1; Priya to ask for it.

## Vikram (26 Oct 2026): spend okayed, with a different yardstick

**Okay: ₹5,000 hard cap, in two halves.** Spend the first ₹2,500 (5 days), then check. Spend the second half only if the first passes the gate below. The ₹2,000 CAC rule is right, and the room above it is real: a paying user leaves about ₹650 a month after GST, Razorpay and AI cost, so ₹2,000 pays back in about 3 months.

**But ₹5,000 cannot measure CAC.** At ₹20–40 a click, it buys 125–250 clicks. At a 3% sign-up rate that is 4–8 sign-ups, and at about 5% of sign-ups paying, under 1 paying user. Any CAC from this test is noise. Measure the step we can see instead:
- **Cost per verified sign-up.** ₹2,000 CAC × 5% sign-up-to-paid means the target is **₹100 per verified sign-up**.
- **Gate after ₹2,500:** continue only if cost per verified sign-up is at or under **₹250**. That is 2.5× the target, a fair margin for a test, and a page or ad fix can close it.
- **Meera's 3% rule is too loose against this.** At ₹40 a click, 3% is about ₹1,300 per sign-up. Keep it as a floor, and add the cost-per-sign-up gate.
- Report each ad group separately. "Format" searchers are often looking for free templates, so if "format-draft" costs over 2× "software" per sign-up, cut it in round 2.

**Cash and tax.**
- Google Ads India adds 18% GST: ₹5,000 of ads is about ₹5,900 out of pocket. The ₹900 comes back as input credit only if the GSTIN is on the Google Ads billing profile. The founder adds it there; it stays out of this repo.
- This is more than the ₹2k a month marketing slot in the founder's ₹10–15k budget. It fits this month only because infra is at ₹4–6k. The founder decides; I'd take it from this month's buffer, not next month's.

**Not before T-403 and Anushka's PASS** (unchanged). Paid clicks must land on the production site, with sign-up source tracking (T-242) and the consent banner working, or the test measures nothing.

Vikram, CFO

## Ajay (26 Oct 2026): copy signed, with conditions

All 8 headlines and 3 descriptions signed as written (handoff/legal/google-ads-test-copy-ruling-ajay.md). The price is GST-inclusive, so the ad needs no "incl. GST". Conditions:
1. Production only, after T-403 and Anushka's PASS. Do not enable before she passes.
2. No Ads or GA cookie before consent. Priya checked the code: gtag loads only after consent and on public pages, and no Ads tag is installed.
3. Auto-apply and AI-generated assets OFF. Sitelinks and callouts need his sign-off (the agent adds none).
4. Pause the campaign if the price, the 50 Ink or the bail/notice templates change.
5. Hindi round 2 goes to him first.

## Reporting (Priya, 26 Oct)

Sign-ups by ad group come from the existing count-by-source report, using utm_source google-format and google-software. T-623 will group by utm_campaign and add paying users per campaign, in time for the end-of-test read. Until then Arjun pulls counts only.
