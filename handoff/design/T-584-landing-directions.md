# T-584 / T-599: landing directions for the founder's pick

Rajesh, 26 Oct 2026. Canvas (Claude Design, private to the account until shared): https://claude.ai/artifact/BUUtog4ppu6xS3Hidid3ou

Three directions, each as a 1280 page and a 390 page, on one canvas so they can be compared side by side. Copy is placeholder, marked `[ ]`, until Madhuri writes it and Ajay signs. Nothing on the boards is a claim. Tokens are DESIGN.md Night; Daylight follows the same system.

| | A · The Shelf | B · The Reading Desk | C · The Reporter |
|---|---|---|---|
| Idea | The catalogue is the hero: headline over a real shelf of spines, one per template, grouped by category | The product performs: the lit folio writes a bail application in the hero; coverage is a card catalogue of 20 drawers that open in place | Type-only statement (Hindi first, English under), then coverage as a law reporter's index, dense two-column |
| Coverage | Shelves, 2 columns at 1280, list rows at 390 | Drawers, 4 columns at 1280, 2 at 390; one open at a time (interactive on the canvas) | Index, 2 columns at 1280, 1 at 390, running numbers in the margin |
| Samples | Three folios in a row | Three folios on a lamp-lit desk | Six folios as a contact sheet, same scale |
| Video | Own section after samples, 8/12 wide | After the demo as "the long version", full width | A plate in the editorial grid, 9/12 |
| Motion | Spines settle once (240 ms, 12 ms stagger, ≤ 32 on phones); pen-writing demo once; lamp follows pointer at 1280 | Pen-writing 2.6 s once with the inkwell; drawers 200 ms | Second line ink-fills once (600 ms); index rows fade 40 ms steps; nothing else |
| Slow data | Medium: spines are CSS, no images | Medium: the folio is HTML, no video until play | Lightest |
| Risk | Tall on a phone | Hero carries less text | Quietest; leans on copy |

Shared rules: coverage list generated from `apps/drafting/src/config/catalogue` (20 categories carry templates today; 92 entries in the base batch where the ticket says 86: the lead resolves aliases and disabled packs before a number is shown); samples are static assets, fictional parties, diagonal SAMPLE watermark, no model call; video is poster + captions badge, lazy, click to play, never autoplay with sound; prices and FAQ carry over from T-511.

Recommendation: **B** for the founder's brief ("animations, sample drafts, a more pleasing UI") because the product itself is the animation and the coverage drawers make "a lot and a lot more" a thing you touch; A is the strongest first impression for breadth; C is the safest on slow data and the most distinctive in type. A and C's coverage sections can be borrowed into B if he wants the shelf.

## T-599 (board 7 on the canvas)
- Legal pages (privacy, terms, refunds): Read mode, restyle only. Night top bar and footer, contents rail from 1024, 65ch column, Mukta 16/27, Tiro headings. Wording byte-identical, version not bumped, Ajay checks.
- Free tools: Operate inside Persuade. Form on a Card with Night Input/Select/Button, result on a folio, T-317 tool disclaimer unchanged, same functions and tests.
- About, FAQ, Contact: the same frame; FAQ reuses the landing accordion; Contact form on a Card.
- Migration order: privacy, tools, about, faq, contact, terms, refunds; one path added to `NIGHT_LIBRARY_MARKETING_PATHS` per step; `.mk` and Inter/Lora/Fraunces removed after the last.
- Splash: no full-screen overlay returns. The wordmark ink-fills once in the hero (600 ms, CSS only, paused when the tab is hidden, static under reduced motion, once per tab session), and the same fill is the app loading screen between sign-in and the shelf, tied to real progress and capped at 1.2 s. Never on legal pages, tools or the editor. `LogoSplash.tsx` retires.

Next: founder picks; then the Figma file and the per-screen handoff spec for the build lead, and Madhuri's copy brief.
