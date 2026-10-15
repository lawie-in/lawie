# T-398 — Pricing page: the "Pro" plan card

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Meera / Madhuri (copy), Vikram (plan names and prices), Ajay (sign), then a web lead |
| Mode   | Small fix (copy) |
| Status | Ready: Ajay conditions in this file; Tanvi builds (small fix + Ajay byte check). Priya, 15 Oct 2026 |
| Source | Tanvi's T-366 Explore; t252 keeps "Pro" out of copy |

## Problem

The pricing page's plan card still names "Pro". The signed site copy (t252) keeps that name out of copy.

## Acceptance criteria

1. Meera and Madhuri give the card's wording, Vikram confirms plan names and prices, and Ajay signs.
2. A web lead applies it on `apps/web/src/app/(marketing)/pricing/page.tsx` after T-366 merges.
3. Ajay re-counts any "more than 90" claim before it is reused.

## Decision (Priya, 13 Oct 2026)

Option A for v1: keep "Pro" and drop the false bullets ("No watermark", Priority support, Early access). Option B (rename to "Higher volume") would also touch the signed FAQ line, billing, receipts and the app. Revisit when Vikram re-tiers Pro after two weeks of data.

## Ajay's conditions (15 Oct 2026; sign-off reference after the edits: "Ajay (CLO), 15 Oct 2026, T-398, pricing-pro-card-t398.md blob 0e6bdc0b / commit 07f46c4"); Vikram confirmed Pro = ₹1,999 /month, 150 Ink/month

1. Pro card (page ~192-201): delete "Everything in Solo, plus" and the three false rows; use the draft's four bullets (150 Ink/month, Everything in Solo, Ink refills every month, Top-up packs available anytime). Button: "Sign up to choose Pro".
2. Solo card (~167-173): delete "No watermark on exports", "Priority email support", "Early access to new templates". Free card: delete "Lawie watermark on exports" (~146). The word "free" appears only with "5 Ink": Free button "Start with 5 free Ink"; Solo button a non-"free" label (Madhuri proposes).
3. Free card: "₹0" with no "/lifetime"; Ink line "5 Ink on sign-up, once your email is verified (lifetime)"; "Every document type on Lawie" only if Free is not gated by type (check).
4. Yearly stays HELD while T-399 is untested. With the toggle off, render NO yearly text at all, including the monthly-view line "or ₹19,990/year — save 2 months". Pro appears on the pricing page only.
5. Tests: extend (marketing)/__tests__/t364-plans-one-source and t366-copy-lines. Ajay byte-checks the diff.
