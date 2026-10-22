# T-531: Mobile top bar, button hover rules, safe area and cookie banner (shell)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Rajesh (rulings 21 Oct 2026), a web lead (build) |
| Mode   | Full chain (web, shared files) |
| Status | Merged into develop_staging a3b267dd (CI 891 green), 22 Oct 2026; waiting on Anushka's check on develop. Follow-ups: T-544, T-549. Priya |
| Source | Rajesh's T-528 calls; Vishal's out-of-scope notes |

## Acceptance criteria
1. Phones (below 720px): the top bar is one 64px row (mark, Ink chip or "Start free", menu) with the language and theme toggles inside the menu; then it is sticky everywhere, including landing, pricing and auth.
2. `ui/Button` hover per variant: lift and halo are primary-only. Ghost and the Google button get a non-lift hover: border from Line to Brass, background to Brass Soft, 150ms, no lift, no halo.
3. `viewport-fit=cover` on the root viewport, with safe-area paddings on the top bar, bottom sheets and toasts.
4. The cookie banner sits at the bottom with the sheet's 12px top radius and never covers the first heading (check pricing at 360).
5. Measure the sticky bar height live (a ResizeObserver setting `--nl-bar-h`) and rename `NL_STICKY_BAR_HEIGHT.wrapped`; `html{scroll-behavior:smooth}` in globals.css gets a reduced-motion opt-out.
6. The shell TopBar renders its nav landmark only when it has links (no empty unnamed `<nav>` from 720 to 1023).
7. Tests; Chromium check at 360, 768 and 1280 in both themes; Rajesh reviews.
