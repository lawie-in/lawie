# T-398 — Pricing page: the "Pro" plan card

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Meera / Madhuri (copy), Vikram (plan names and prices), Ajay (sign), then a web lead |
| Mode   | Small fix (copy) |
| Status | Copy in handoff/marketing/copy/pricing-pro-card-t398.md. Priya picks option A for v1 (keep the name "Pro", only true lines; Meera's call, smaller scope). Waiting for Vikram (name and price), then Ajay. Then a web lead, after T-366 |
| Source | Tanvi's T-366 Explore; t252 keeps "Pro" out of copy |

## Problem

The pricing page's plan card still names "Pro". The signed site copy (t252) keeps that name out of copy.

## Acceptance criteria

1. Meera and Madhuri give the card's wording, Vikram confirms plan names and prices, and Ajay signs.
2. A web lead applies it on `apps/web/src/app/(marketing)/pricing/page.tsx` after T-366 merges.
3. Ajay re-counts any "more than 90" claim before it is reused.

## Decision (Priya, 13 Oct 2026)

Option A for v1: keep "Pro" and drop the false bullets ("No watermark", Priority support, Early access). Option B (rename to "Higher volume") would also touch the signed FAQ line, billing, receipts and the app. Revisit when Vikram re-tiers Pro after two weeks of data.
