# T-549: Consent sheet in Night tokens, Wall ground, TopUpModal as a Dialog sheet (from T-531)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (build), Rajesh reviews, Ajay for any wording |
| Mode   | Full chain (web, shared UI files: one lead at a time) |
| Status | Merged into develop_staging 245e85dc (CI 907 green), 22 Oct 2026, except item 6 (Hindi menu labels, waits for Madhuri and Ajay); waiting on Anushka's check on develop. Priya |
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

## Follow-ups from the T-549 review (Rajesh, 22 Oct 2026; separate ticket after T-549)
- `.float-cta` has no bottom safe-area inset.
- `PrivacyUpdatePrompt` has no side insets.
- Headers of `/tools/*` and `review/[token]` (own headers, centred content, low risk).
- Rajesh narrows the One Shadow Rule in DESIGN.md: fixed overlays get their own shadow level.
- Rulings: on legacy `.mk` pages the consent card is always Daylight (M1, before T-403); 4px desktop radius, 44px buttons, Card shadow approved.

## Arjun's acceptance of older-browser risk (22 Oct 2026)
Residual risk on Safari before 16 accepted for the pilot and for main. Safari 16 shipped in Sept 2022; its share among Indian advocates on iOS is well under 1 %, and the failure is cosmetic (page behind a dialog may scroll, a sticky bar may unstick), not data loss. No device check required before main. Supported-browser line for the help page and Anushka's run: Chrome/Edge 110+, Safari 16+, Firefox 110+, Android Chrome current. Revisit only if a pilot user reports it.
