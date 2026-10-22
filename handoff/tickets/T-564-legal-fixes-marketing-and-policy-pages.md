# T-564: Legal fixes, marketing and policy pages (review section A)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (MUST items block Anushka's browser run) |
| Owner  | Lead (build, web), Ajay byte-checks |
| Mode   | Full chain (web, legal content) |
| Status | To do. Kunal after T-544. MUST before Anushka. Priya, 22 Oct 2026 |
| Source | Ajay's pre-Anushka legal review: `handoff/legal/pre-anushka-legal-review-22-oct.md` (22 Oct 2026, b871e0f7) |

## Items
Review section A: **1 to 14 are MUST**, 15 to 22 SHOULD (do them too, same files). Covers: tools, about, faq, terms (items 9 and 10: reuse Terms version 2026-10-22, keep the date), contact, refunds (whole page, signed text in the review; "Last updated" becomes the release date; remove every annual-plan mention), pricing layout meta, SiteNav/FloatCta CTA wording, and DELETING unused files with false claims (item 14: landing/FinalCTA, TrustBar, WaitlistForm, Footer, Navbar and marketing/PriceToggle; confirm nothing imports them first). Item 12: keep the current backups sentence until Flex (T-532). Item 13: the `tool_bail_checker` flag stays OFF; no code change, note it in READY. Item 21 (nl-copy.ts:148) waits for Vishal's T-522 to merge (he holds nl-copy.ts).

## Rules for every item
Signed fix text is in the review file next to its item number (file:line, current text, signed fix). Paste it **byte for byte**; if a line has moved, find it by the current text. Anything unclear goes to the real Ajay (session_019mZoKeM2MTfCyV5HEZrqnZ), never invented. Files under `.claude/docs/legal-content-paths.md` come back to Ajay for a byte check at READY. Do not touch files held by another lead's claim row; wait for their merge or ask Priya.
