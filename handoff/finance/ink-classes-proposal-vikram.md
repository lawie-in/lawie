# Ink classes S / M / L: proposal (ADR-026 D7)

Vikram (CFO), 15 Oct 2026. For the founder, who sets the prices. Proposed, not decided. Needed before drafting-v2 phase 0 (after T-403).

## Proposal

| Class | Ink | What goes in it | Est. API cost per draft | Per Ink | Pro-yearly margin at full use |
|---|---|---|---|---|---|
| S | **1** | Short, single-purpose: most notices, affidavits, simple applications (the 31 kinds at 1 Ink today) | ≈ ₹2.90 | ₹2.90 | 68% |
| M | **2** | Standard drafts: bail, complaints, ordinary petitions (today's default) | ≈ ₹6.60 | ₹3.30 | 64% |
| L | **5** (not 4) | Long pleadings: writs, appeals, plaints, multi-clause deeds | ≈ ₹16.30 | ₹3.25 | 65% |

Basis: approved models (Sonnet 5.5 body, Haiku 5.5 intake and preflight), list prices at ₹88/$, uncached, plus library retrieval passages. M uses Arjun's measured-shape estimate (20k/3k intake, 12k/1k preflight, 12k/3k body) plus 8k of retrieval. S and L token shapes are CFO estimates. All of these are replaced by T-453's measured cost per draft.

**Why L is 5, not 4:** at 4 Ink an L draft costs about ₹4.07 per Ink, above the ₹3.70 line. At 5 Ink it costs ₹3.25.

## The review rule

- **Line:** ₹3.70 API cost per Ink. That is a 60% gross margin on Pro yearly (net ₹9.19 per Ink after GST and Razorpay) with every Ink used.
- **Monthly:** for each document kind, take the measured p90 cost per draft ÷ Ink charged. A kind above ₹3.70 moves up one class; a kind under ₹2 for two months running may move down.
- **Class prices** change only by the founder's decision, with Meera's and Ajay's copy re-signed. The price a user sees is fixed at Confirm and never changes mid-draft.

## Conditions

1. **Cap model thinking.** Both 5.5 models think by default, billed as output. If thinking doubles the body's output, the costs per Ink become S ₹4.25, M ₹4.63, L ₹6.05, all over the line. Arjun's verification ticket must set a thinking budget per class before phase 0.
2. **Copy:** "Most documents use 2 Ink; short ones 1" gains "long pleadings 5". Meera and Ajay re-sign it before L ships.
3. **Plan value check:** Solo's 50 Ink buys 25 M drafts or 10 L drafts. Meera to confirm that still sells.

## Also on the finance list

- CNR lookup pilot (eCourtsIndia, credits-based, pricing not public): approved post-v1. I price it once the founder has an account (ADR-026 §11).
