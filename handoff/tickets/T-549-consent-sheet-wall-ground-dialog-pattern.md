# T-549: Consent sheet in Night tokens, Wall ground, TopUpModal as a Dialog sheet (from T-531)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (build), Rajesh reviews, Ajay for any wording |
| Mode   | Full chain (web, shared UI files: one lead at a time) |
| Status | To do. Consent sheet item MUST land before T-403 (Rajesh, T-531 review F1). Priya, 21 Oct 2026 |
| Source | Rajesh's T-531 review; Vishal's report |

## Items
1. **Consent sheet** (`components/AnalyticsConsent.tsx`): Night tokens: Card fill, Line border, Tiro heading, Body Soft text, Brass Text link, and two equal ghost buttons so Ajay's neutrality holds (no accept-weighted button). Ajay checks the buttons are equal in weight.
2. **Wall ground** on `html` and `body` so white never shows on overscroll.
3. **TopUpModal** moves to the Dialog sheet pattern.
4. **Legacy headers**: side safe-area padding.
5. **Menu inset alignment** nit in the phone menu.
6. **Hindi menu labels** for Documents, Prices, FAQ and Sign in are unsigned: Madhuri drafts, Ajay signs; build after.
7. Older browsers: `overflow-x: clip` (Safari under 16) and `90dvh` (iOS under 15.4) need fallbacks, or Arjun accepts the risk in writing.

## Acceptance criteria
Each item done with tests, checked at 360 / 768 / 1280 in both themes; Rajesh signs; Ajay signs 1 and 6.
