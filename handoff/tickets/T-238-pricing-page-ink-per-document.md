# T-238 — Pricing page says every document costs 1 Ink

| Field          | Value |
| -------------- | ----- |
| Phase          | 2 — Drops pricing |
| Owner          | Madhuri (copy), Meera signs. Ajay (consumer-protection check). Lead (build). Anushka (verdict) |
| Mode           | Small fix after the copy is signed |
| Status         | Copy signed: Meera wrote it, Ajay approved with changes, 12 Oct 2026. Ships only after T-227 merges. Unassigned. Was: waits for Madhuri's copy. Found by shashank during T-227, 12 Oct 2026 |
| Depends on     | T-227 (the prices) |

## Problem

`apps/web/src/app/(marketing)/pricing/page.tsx` (line ~42) says "Each document you generate uses 1 Ink". Under Vikram's prices (T-227), most documents cost 2 Ink and 31 short documents cost 1. A price claim that doesn't match the charge is a consumer-protection risk.

## Acceptance criteria

1. Madhuri writes the line and Meera signs it, e.g. "Most documents use 2 Ink; short documents such as notices and affidavits use 1. You see the price before you generate." Ajay checks it.
2. The lead changes only that copy.
3. No other price claim on the public pages contradicts T-227 (grep for "Ink").

## Signed copy (Meera wrote it; Ajay approved with changes, 12 Oct 2026)

- **Line ~42 (FAQ "What is Ink?"), final text:** "Ink is Lawie's credit unit. Most documents use 2 Ink; short documents, such as most notices and affidavits, use 1. You're charged only after a draft is generated; a failed generation is not charged. The Free plan gives you 5 Ink (lifetime). Solo and Pro plans refill Ink every month. You can also buy top-up packs anytime."
- **Line ~202:** "Less than ₹16 per document on Solo" becomes "Most documents use 2 Ink, short ones 1. Buy extra packs anytime."
- **AC3:** done by Ajay. There is no other public per-document price claim.
- **Left out on purpose:** "You see the price before you generate". Add it back when T-227 AC3 ships.
- **Separate:** Ajay is reviewing the refund FAQ against the Refund Policy and consumer law. No change tonight.

## More pricing-page claims to fix (Vikram, 12 Oct 2026; Ajay to check)

- The "Most Popular" and "POPULAR" badges have no users behind them. Remove them.
- The Free plan lists "Court formatting" and "BNS validation". Ajay bans "court-ready" and "validated", so reword these.
- The ₹16 line (line ~202): Vikram is fine with the replacement, since it quotes no rupee price per document.
- Cleanup, not blocking launch: `Subscription.model.ts` still says "79900 or 699900", and the `/subscribe` comment still names `practice_*` / `firm_*`.

## Scope widened (Priya, 12 Oct 2026)

AC2 now covers the whole pricing page: rows 1–6 of Meera's `handoff/marketing/copy/pricing.md` before/after table. Rows 7–14 and the other pages are in T-252. Every changed line still needs Ajay's ok.
