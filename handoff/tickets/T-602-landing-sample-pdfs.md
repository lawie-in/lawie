# T-602: Landing sample drafts — a render script and three watermarked PDFs

| Field  | Value |
| ------ | ----- |
| Phase  | 5 — Growth (second build half of T-584; no UI) |
| Owner  | Arjun (design), Ajay (reviews the PDFs themselves), Vishal (build, after T-600) |
| Mode   | Full chain (drafting + static files under apps/web/public) |
| Status | To do. Raised 26 Oct 2026 from Kunal's T-601 Explore and Arjun's ruling. After T-600. Priya |
| Source | Arjun's note of 26 Oct 2026; Ajay's samples ruling (handoff/legal/T-584-landing-copy-rulings-ajay.md) |

## Acceptance criteria
1. A drafting-workspace script `yarn workspace @lawie/drafting samples:render` runs the real engine with fixed fictional parties (names from Ajay's samples ruling: obvious placeholders such as Sample Person 1 / Sample Traders), exports through the existing PDF path, and stamps a diagonal "SAMPLE — not legal advice" layer on every page. If the current PDF library cannot stamp, `pdf-lib` as a dev dependency is approved (build-time only).
2. Output is committed as static files under apps/web/public/samples/, at most 500 KB each. No live Anthropic call from the page, and none from the script in CI (the script runs on demand).
3. Samples (Ajay AJ-601-S, 1e183079, 26 Oct 2026): the BREACH-OF-CONTRACT notice (legal_notice_breach_of_contract; parties Sample Traders / Sample Packaging Works; watermark on every page), NOT the s.138 notice (an s.138 sample needs new text and Ajay's sign-off first), and the maintenance petition (maintenance_bnss_144) now. The regular-bail sample joins only when T-245a is confirmed merged (the T-245 ticket Status line is stale; confirm against git before relying on it). No criminal sample before that. No plaint sample (plaints are off in v1).
4. Ajay reviews the three PDFs themselves before they ship (his condition); Kunal's `.gitignore` negation (`!apps/web/public/samples/*.pdf`) lands only after Ajay signs.
5. No secrets, no env dump; drafting tests and build green.

## Files
Claimed by Priya when Vishal takes it: a script under apps/drafting, its package.json entry, a test, apps/web/public/samples/*.pdf (after Ajay signs).
