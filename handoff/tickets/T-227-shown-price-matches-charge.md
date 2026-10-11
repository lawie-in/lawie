# T-227 — The price a user sees is the price charged

| Field          | Value |
| -------------- | ----- |
| Phase          | 0 — Prep |
| Owner          | Vikram (the price of each document), Ajay (heads-up: CPA 2019), Lead (build), Anushka (verdict) |
| Mode           | Vikram's price list first, then build, full chain (drafting, web) |
| Status         | Ready. Vikram's price list is in (11 Oct 2026). Unassigned |
| Size           | S (0.5 day) after the list |
| Depends on     | None. Drops pricing (T-201 to T-205) replaces this later; this fixes v1 as it stands |
| Gate           | Before v1 go-live (T-403) and before T-222's welcome email ships |
| Branch         | fix/t-227-price-matches-charge |
| Legal sign-off | `document-rules/` is a legal-content path: AC2's single source should move the price out of the rule files (a price list in code), so Ajay's signed rule files are not edited. If the lead must edit them, Ajay signs that diff. CPA 2019 s.2(47): shown and charged must match |
| Created        | 2026-10-11 |
| Source         | Ajay, during the T-222 claims check, 11 Oct 2026. Priya checked the code |

## Problem

58 rule files in `apps/drafting/src/config/document-rules/` carry `"creditsCost": 2`, which the app shows (corrected by Vikram, 11 Oct). 6 carry no price and show the default of 1, including `bail_regular`, `bail_anticipatory` and `consumer_complaint`, which are charged 2: shown 1, charged 2 is an overcharge, the worse case. `apps/drafting/src/services/credits.service.ts` (`TEMPLATE_COST`) charges 2 only for `bail_regular`, `bail_anticipatory` and `consumer_complaint`, and 1 for everything else. Users see one price and pay another.

## Acceptance criteria

1. Vikram writes the price of each document in this file, or a rule (for example, 2 for bail and consumer complaint, 1 for the rest).
2. One source of truth: the shown price and the charged price come from the same place. A test fails if they ever differ for any template.
3. The draft screen shows the cost before the user generates (Ajay's condition for T-222 change 2). If it already does, the lead says where.
4. CI green on drafting and web.

## Out of scope

- Drops pricing (T-201 to T-205)

## References

- T-222 (Ajay claims check), T-226

## Vikram (11 Oct 2026)

**Correction to the Problem section.** The 58 files are in `apps/drafting/src/config/document-rules/`, not `docs/templates/` (that folder has 6 files and no `creditsCost`). Count there: 92 rule files, 58 at 2, 28 at 1, 6 with no `creditsCost`. The six missing are exactly the six in `TEMPLATE_COST`, so the seed shows them at the default 1 while bail_regular, bail_anticipatory and consumer_complaint are charged 2. That is an overcharge (shown 1, charged 2) and is the worse CPA case; the other 58 mismatches undercharge (shown 2, charged 1).

**v1 price rule**

| Rule | Ink | Reason (model cost) |
| --- | --- | --- |
| Default: every document | 2 | Petitions, pleadings, appeals and multi-clause deeds/agreements run long. Est. ~15k input + ~8k output tokens, about ₹14.5 per draft on Sonnet 4 |
| Exception: the 31 documents listed below | 1 | Notices, affidavits, short applications and simple instruments. Est. ~6k input + ~3k output tokens, about ₹5.5 per draft, under half the long-document cost |

1-Ink list (the 28 rule files already at 1, plus 3 that keep today's charge):
affidavit_identity, affidavit_in_support, amendment_of_pleadings, condonation_of_delay, counter_affidavit, divorce_mutual_consent, gpa, legal_notice_breach_of_contract, legal_notice_consumer_deficiency, legal_notice_copyright_infringement, legal_notice_defamation, legal_notice_eviction, legal_notice_trademark_infringement, list_of_dates, maintenance_bnss_144, memo_of_parties, mou, nda, production_of_documents, receiver_appointment, rejoinder_affidavit, restoration_application, service_agreement, spa, synopsis, temporary_injunction_o39, vakalatnama, will, **legal_notice_s80, legal_notice_s138, rent_agreement**.

Everything else is 2, including **bail_regular, bail_anticipatory, consumer_complaint** (unchanged charge) and the 58 rule files that already show 2.

Why this way round: it matches the price every user has been shown for 89 of 92 documents, so only 3 shown prices change: bail_regular, bail_anticipatory and consumer_complaint go from showing 1 to showing 2, which is what they have always been charged. The 58 documents currently charged 1 get charged what the screen already says. Note for the build: the code default (`?? 1` in `costForTemplate`, the seed and the promoter) must not decide a price; every template needs an explicit value.

**Sign-up credits (for T-222)**

- What the user can spend on drafts is **5 Ink** (`grantSignupBonus` seeds `inkTopup: 10` units = 5 Ink; `spendInk` is what charges).
- Under this rule, 5 Ink buys **5 short drafts, or 2 long drafts plus 1 short one**. A draft is charged once, on success; a failed generation is not charged.
- Safe email line: "5 free Ink: up to 5 drafts. Notices and affidavits use 1 Ink; bail applications, petitions, plaints and agreements use 2."

**Assumptions and risk**

| Assumption | Value | Source | Sensitivity |
| --- | --- | --- | --- |
| Sonnet 4 price | $3 / $15 per M input/output tokens | Anthropic list price | Any price change moves both tiers by the same ratio |
| FX | ₹88 / USD | Vikram, Oct 2026 | ±5% FX moves ₹/draft by ±5% |
| Tokens per draft | 6k/3k short, 15k/8k long | **Estimate, not measured** | **Biggest risk.** If long drafts run 2x tokens (multi-section, repair pass is free to the user), cost is about ₹29 |

- Largest cost driver: output tokens on long documents (~80% of the cost of a draft).
- Action: pull real per-template tokens from the T-003 usage rows after 2 weeks of v1 traffic. I will re-tier any 1-Ink document that costs more than ₹10.
