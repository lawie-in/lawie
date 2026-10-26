# Google Ads search test (Meera, 26 Oct 2026)

Status: DRAFT. Not running. Needs (1) Vikram's okay on the spend, (2) Ajay's sign-off on the ad copy, (3) the founder's cash decision. Gates unchanged: T-403, Anushka's PASS. Founder asked for this test on 26 Oct. Every number is a guess until we have data.

## The test

| Item | Value |
| --- | --- |
| Type | Google Ads Search only. Search partners off. No Display, no video, no Performance Max |
| Budget | ₹500 a day, 10 days, about ₹5,000 total. Hard stop on the end date |
| Bidding | Manual CPC, max CPC ₹40. No automated bidding in the test |
| Language | English. Hindi ads in round 2 after Ajay reads the Hindi |
| Locations | Bihar, Jharkhand, Uttar Pradesh, Madhya Pradesh, Rajasthan, Delhi NCR (the district-court junior ICP) |
| Landing page | The Lawie landing page, with UTMs: utm_source=google, utm_medium=cpc, utm_campaign=search-test-oct26, utm_term={keyword} |
| Goal | Sign-ups (GA key event). A sign-up counts only after the consent banner is accepted |
| Rule | Blended CAC (spend ÷ new paying users) at or under ₹2,000 (Vikram) |
| Stop rule | After about 150 clicks, if sign-ups are under 3% of clicks, pause. Change the ad or the page before spending more. Also pause if spend hits ₹5,000 |

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
- Do not install any new tag or edit the website. Only link GA4 and import the existing sign-up key event as the conversion goal, if it exists. If it does not, stop and tell me.
- Change nothing else in the account.
- If a screen is unclear or asks something not covered here, stop and ask me.

Campaign:
- Type: Search. Goal: Leads or Website traffic (use the sign-up conversion if available). Name: search-test-oct26.
- Networks: Google Search only. Turn OFF Search partners and Display network.
- Locations: Bihar, Jharkhand, Uttar Pradesh, Madhya Pradesh, Rajasthan, Delhi. Presence only (people in the location).
- Language: English.
- Budget: INR 500 per day. Start date: the day I tell you. End date: 10 days after the start.
- Bidding: Manual CPC, max CPC INR 40. Enhanced CPC off.
- Ad group 1 "format-draft". Keywords: [bail application format] [legal notice format] "bail application draft" "anticipatory bail application" "draft legal notice online" "affidavit format"
- Ad group 2 "software". Keywords: "legal drafting software" "legal drafting software for advocates" "ai legal drafting india"
- Negative keywords (campaign level, phrase match): lawyer near me, advocate near me, hire, consultation, free legal advice, jobs, course, internship, salary, college, exam
- One Responsive Search Ad per ad group, same text. Final URL: {LANDING_URL}/?utm_source=google&utm_medium=cpc&utm_campaign=search-test-oct26&utm_term={keyword}
  Headlines: 1) Lawie: Drafting for Advocates 2) Start with 5 free Ink 3) First Draft, You Review It 4) Bail Application Draft 5) Legal Notice Draft 6) You Stay the Advocate 7) Solo Plan ₹799 a Month 8) Describe It, Get a Draft
  Descriptions: 1) Describe your matter in plain words. Lawie writes a first draft. You review and edit it. 2) Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing. 3) Start with 5 free Ink once you verify your email. Solo plan ₹799 a month, 50 Ink.
- Do not pin headlines. Do not add images, sitelinks, callouts or call extensions.

When done: leave the campaign PAUSED, then send me a screenshot or text list of every setting above as saved, plus anything Google flagged or disapproved. Do not click Enable.
```

Before anyone enables it: Vikram okays the spend, Ajay signs the copy, the founder confirms the cash, and Priya or the web lead confirms the sign-up conversion respects the consent banner.
