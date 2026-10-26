# T-608: The dashboard "What do you need to draft?" box silently cuts the description at 500 characters

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (data loss without warning; UI) |
| Owner  | a lead (build; web). Arjun 26 Oct: behaviour only, no Rajesh |
| Mode   | Small fix (web only); Rajesh gate for the visible hint |
| Status | To do. Raised 26 Oct 2026 from Anushka's prod smoke. Priya |
| Source | Anushka's report: a 657-character description stopped mid-sentence at "he is the" |

## Problem
`DRAFT_PREFILL_MAX = 500` in apps/web/src/components/dashboard/DashboardCommandBar.tsx cuts the description carried to the New document page at 500 code points, with no warning. The New document page allows 4,000. A lawyer who types into the dashboard box loses part of the facts without being told.

## Acceptance criteria
1. Either carry up to the New document page's limit (4,000), or show a visible character counter and stop typing at the limit. Never a silent cut. Rajesh decides which (one line).
2. The limit constant is shared with the New document page so they cannot drift.
3. Test: a 657-character description arrives whole (or is blocked with a visible message).

## Files
apps/web/src/components/dashboard/DashboardCommandBar.tsx and its tests; the New document page limit constant only if shared. Claimed by Priya when a lead takes it.

## Added by the 26 Oct prod check (Anushka, item 6)
The box holds all 657 characters but only 499 reach the New document page, with no warning; the sole-earner, chargesheet, sureties and magistrate's-refusal facts were dropped. The box also suggested 'Bail application' but opened the general page. Text typed right after the New document page loads sometimes did not appear (unconfirmed: the browser may not have had focus).
