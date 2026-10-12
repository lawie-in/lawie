# Design notes: one system for all launch posts

Owner: Rajesh. Build once in Figma (one file, one page per template, components for header/footer/disclaimer/Ink pill), mirror in Canva with the same tokens. Briefs in `calendar-week1.md` and `calendar-week2.md` refer to sections here.

## 1. Grid and sizes

| Use | Canvas | Margin | Body min | Disclaimer min | Hindi min |
| --- | --- | --- | --- | --- | --- |
| Instagram feed / carousel | 1080x1350 | 72 px (keep text inside centre 1012 px; grid crops 3:4) | 44 px | 40 px | 44 px |
| Reel | 1080x1920 | safe area x 80-930, y 270-1440 | 48 px | 48 px | 48 px |
| LinkedIn tall | 1200x1350 | 80 px | 48 px | 44 px | 48 px |
| LinkedIn wide | 1200x627 | 60 px | 44 px | 40 px | 44 px |
| X | 1600x900 | 100 px sides, 80 px top/bottom | 64 px | 56 px | 64 px |
| WhatsApp | 1080x1080 | 72 px | 44 px | 40 px | 44 px |

- Why these minimums: a feed image shows at about 390 pt wide on a mid-range Android, so 1080 px wide = x0.36. 44 px is about 16 pt on screen.
- Zones, top to bottom: header (lockup, 170 px), content, footer (disclaimer + optional CTA, 220 px on 1350 high, 150 px on 627 and 900 high). Footer is a separate band: navy on cream ground, cream border line on navy ground.
- 12 px baseline; 24 px minimum gap between text blocks.
- Weight: flat colours only, no gradients, no photos. PNG-8 or JPEG q80-85. Targets: WhatsApp under 150 KB, IG/LinkedIn/X under 300 KB (patchy 4G).

## 2. Tokens (from `apps/web/tailwind.config.js` and `marketing.css`; no new colours)

| Token | Hex | Use |
| --- | --- | --- |
| navy | #0D1F3C | ground, headline text on light |
| page | #FAF8F3 | light ground |
| white | #FFFFFF | text on navy, cards |
| gold | #C8850E | rules, numerals 96 px+, outlines. About 5.3:1 on navy; about 2.9:1 on cream, so never text on light |
| gold-dark | #7A4E00 | text on gold-light |
| gold-light | #FBF1DC | label chip ground (Sample, fictional matter) |
| muted | #566580 | secondary text on light (about 5.6:1) |
| line | #DCD6C8 | card borders |
| teal-dark | #0A6F66 | focus/success marks only, rarely |

- Never: the red in the logo as a design colour, the `lawie-*` blues, teal fills, error red, dark mode (Phase 2).
- Fonts: Lora 600 for English headlines (as on the site). Inter 500/600 for body. Devanagari: Noto Sans Devanagari 600 for headlines, 500 for body (Mukta is the fallback). Embed fonts at export; no system fallback.
- Devanagari: line-height 1.4 or more, no letter-spacing, no all-caps, no italics, no faux bold.

## 3. Three templates

**T1 Quote card.** Gold rule 8 x 160 px, headline (Lora 600, 3 lines max), optional sub-line, footer zone. Navy ground with white text, or cream ground with navy text. Variants: launch (steps list), checklist (hollow checkboxes only, never ticks), table (Ink pills). No quotation marks, no seals, no stars.

**T2 Screen with callout.** Headline top, screenshot in a white card (radius 16, 2 px #DCD6C8 border), up to one gold numbered callout ring per screenshot, callout label in Inter 600. Callouts point at UI regions (a menu, a field), never at a section citation or a sentence of legal text. Screenshots: live app only, desktop browser at 2x, no phone frame, no browser chrome, no account details. Any case detail visible means the chip `Sample, fictional matter` (gold-light ground, gold-dark text, 40 px+) is pinned top-left of the card. Sample values only: A. Kumar (sample), FIR No. 000/2026, Sample Nagar, offence date after 1 July 2024. Static posts never show a legible section citation (Ajay checks frames only in reels).

**T3 Document-family tile.** Rounded rectangles (radius 16), white on cream or navy-on-white, 8 px navy left edge, lucide `file-text` icon, label Inter 600. One tile per document name in the post's own list, in its order; no tile for a type the copy does not name. No scales, gavels, circuit lines, robots.

## 4. Hindi/English pairing and logo

- A post has one language version, so each image is exported in two files from the same layout: `_en` and `_hi` (a layer set, toggled). Same positions, same sizes.
- The disclaimer stays English verbatim in both exports (Ajay's wording).
- Where a headline is bilingual (rare), English first, Hindi below at equal or larger size, separated by 24 px; never side by side.
- English words inside Hindi lines (bail application, notice) set in Inter at 92% of the Devanagari size so x-heights match.
- Logo: `apps/web/public/lockup.png` (on light) and `lockup-on-dark.png` (on navy). No tagline version (the SVG mark in code carries "AI Legal Productivity"; do not use it on creatives). Clear space = half the logo height on all sides. Minimum width 240 px on a 1080 canvas. Do not recolour, outline or put on gold.

## 5. End card (carousel last slide and reel end)

- Navy ground, lockup-on-dark centred (560 px wide on 1080), gold rule.
- CTA `Start with 5 free Ink` (Lora 600, 76-80 px, white) then `lawie.in` (Inter 600, 56 px). Gold underline rule, no button shape.
- Disclaimer, verbatim, Inter 48 px, white at 92%, 3 lines max, y 900-1100 on a reel, inside the safe area (the subtitle band stays at y 1200-1400; full reel positions in `reels.md`). Visible for the whole end-card duration, no fade-in delay.
- Nothing else: no offer, no rupee, no badge.

## 6. Accessibility and review

- Contrast AA minimum for every text/ground pair (use the Figma contrast check before export). Alt text lives in each brief; write it as a plain description, no claims beyond the post.
- Pre-publish check for each export: copy matches the calendar line for line; disclaimer present where the post mentions output; no rupee unless in the copy; no sample detail without the chip; Ajay has signed the line.
- Banned visuals: robot or AI-glow imagery, court-ready look (seals, stamps, "certified"), ticks or shields implying verification, stars, testimonials, client-getting messages.
