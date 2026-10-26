# Google Ads browser-agent prompt, v2 (Meera, 26 Oct 2026)

Why v2: the first agent run stopped at "Create your first campaign". The Ads account is new and billing is not set up. The agent rightly would not enter billing. The founder does Part A himself (about 5 minutes). Then the agent runs Parts B and C. Plan and approvals: google-ads-test.md. Do not enable before Anushka passes production (Ajay condition 1).

## Part A: the founder does this by hand (not the agent)

1. In the wizard, find "Switch to Expert Mode" (bottom of the page). Then choose "Create an account without a campaign". Do not finish the guided wizard.
2. Set country India, time zone IST, currency INR. These cannot be changed later.
3. Billing: choose manual payments (prepaid) if offered, and add only what the test allows (₹2,500 for Round A). A prepaid balance is a hard cap. Enter the GSTIN on the billing profile if you have one (Vikram: the 18% GST comes back as input credit only with the GSTIN).
4. The "sign-up offer" banner (₹20,000 credit): read the Terms before billing. Credits need a spending requirement within 60 days. Do not accept any requirement above our ₹5,000 cap. Vikram checks the terms if unsure. We never chase a credit by spending more.
5. Tell the agent "billing is done" and give it the landing page address.

## Part B and C: paste this into the browser agent

```
You are my Google Ads setup assistant. I am signed in to the account. Billing is done. Build ONE Search campaign and leave it PAUSED. You must NOT enable it, and you must NOT enter, change or view payment, billing or card details. Work in the two phases below and be efficient: I have a usage limit, so do not take screenshots you do not need.

HARD RULES
- Use ONLY the text given below. Never add, reword, shorten or "improve" a keyword, headline or description, even if Google says the ad strength is Poor or Average. Ignore ad strength.
- Never accept a Google recommendation, suggestion, "optimisation score" action, auto-applied recommendation, budget increase, broad match, or any AI feature. If a pop-up offers one, close it or choose the option that keeps my settings.
- Turn OFF every one of these wherever you find them: AI Max for Search, Automatically created assets, Text customization, Final URL expansion, Keyword match auto-expansion, Search partners, Display Network, Auto-apply recommendations.
- Do not set up conversion tracking, do not link GA4, do not install or edit any tag, do not touch the website, do not change the auto-tagging setting. If a screen pushes you to set up conversions, skip it.
- Add NO sitelinks, callouts, call assets, images, structured snippets or lead forms.
- Change nothing else in the account. If a screen is unclear, or a required field is not covered here, STOP and ask me. Do not guess.

PHASE 1: create the campaign (Expert Mode)
1. Campaigns > New campaign > choose "Website traffic" as the objective (if Google makes you pick a goal and offers "Create a campaign without a goal's guidance", choose that instead). Campaign type: Search. Name: search-test-oct26.
2. Results/conversions: do not set any. Skip conversion goals.
3. Bidding: focus on Clicks. Choose "Select a bid strategy directly" and pick Manual CPC. Turn "Enhanced CPC" OFF. If Manual CPC is not offered, use Maximize clicks with a maximum CPC bid limit of INR 40 and tell me you did.
4. Default maximum CPC bid: INR 40 (on each ad group).
5. Networks: Google Search ONLY. Search partners OFF. Display Network OFF.
6. Locations: Bihar, Jharkhand, Uttar Pradesh, Madhya Pradesh, Rajasthan, Delhi (state level). In "Location options", choose "Presence: People in or regularly in your targeted locations". NOT "Presence or interest".
7. Languages: English only.
8. Budget: INR 500 per day. Delivery: standard.
9. Start and end dates: leave the defaults alone for now. The campaign stays PAUSED. I will set the dates when I enable it.
10. Negative keywords, campaign level, phrase match: lawyer near me, advocate near me, hire, consultation, free legal advice, jobs, course, internship, salary, college, exam.

PHASE 2: ad groups and ads
Ad group 1, name "format-draft". Keywords, with these exact match types:
[bail application format]
[legal notice format]
"bail application draft"
"anticipatory bail application"
"draft legal notice online"
"affidavit format"
Final URL for its ad: {LANDING_URL}/?utm_source=google-format&utm_medium=cpc&utm_campaign=search-test-oct26-format

Ad group 2, name "software". Keywords:
"legal drafting software"
"legal drafting software for advocates"
"ai legal drafting india"
Final URL for its ad: {LANDING_URL}/?utm_source=google-software&utm_medium=cpc&utm_campaign=search-test-oct26-software

In each ad group create ONE Responsive Search Ad with exactly this text (same text in both):
Headlines (8): 
1. Lawie: Drafting for Advocates
2. Start with 5 free Ink
3. First Draft, You Review It
4. Bail Application Draft
5. Legal Notice Draft
6. You Stay the Advocate
7. Solo Plan ₹799 a Month
8. Describe It, Get a Draft
Descriptions (3):
1. Describe your matter in plain words. Lawie writes a first draft. You review and edit it.
2. Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.
3. Start with 5 free Ink once you verify your email. Solo plan ₹799 a month, 50 Ink.
Do not pin any headline or description. Leave the display path empty. Do not add a tracking template or URL suffix.

FINISH
Save everything. Make sure the campaign status is PAUSED (and both ads, if they show a separate status, are not "removed"). Do not click Enable or "Publish and enable". Then reply with a plain list of every setting above AS SAVED (campaign, bidding, networks, locations and the location option, language, budget, negatives, both ad groups with their keywords and match types, both final URLs, headline and description counts), plus anything Google flagged, disapproved, or changed on its own. If any setting could not be set exactly as written, say which and why.
```

## After the agent finishes

Send the agent's list to Meera. She checks it line by line against google-ads-test.md. Nobody enables it until: Anushka's PASS on production, the founder confirms the cash, and the founder sets the start date and a 5-day end date (Round A). The agent never does that step.
