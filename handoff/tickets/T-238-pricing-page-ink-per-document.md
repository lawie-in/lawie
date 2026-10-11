# T-238 — Pricing page says every document costs 1 Ink

| Field          | Value |
| -------------- | ----- |
| Phase          | 2 — Drops pricing |
| Owner          | Madhuri (copy), Meera signs. Ajay (consumer-protection check). Lead (build). Anushka (verdict) |
| Mode           | Small fix after the copy is signed |
| Status         | To do. Waits for Madhuri's copy. Found by shashank during T-227, 12 Oct 2026 |
| Depends on     | T-227 (the prices) |

## Problem

`apps/web/src/app/(marketing)/pricing/page.tsx` (line ~42) says "Each document you generate uses 1 Ink". Under Vikram's prices (T-227), most documents cost 2 Ink and 31 short documents cost 1. A price claim that doesn't match the charge is a consumer-protection risk.

## Acceptance criteria

1. Madhuri writes the line and Meera signs it, e.g. "Most documents use 2 Ink; short documents such as notices and affidavits use 1. You see the price before you generate." Ajay checks it.
2. The lead changes only that copy.
3. No other price claim on the public pages contradicts T-227 (grep for "Ink").
