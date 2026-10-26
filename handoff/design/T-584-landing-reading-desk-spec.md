# T-584 / T-599 handoff spec: the landing page, direction B "The Reading Desk", and the other marketing pages

Rajesh, 26 Oct 2026. Founder's pick: B (T-584, 26 Oct). Directions and rationale: `handoff/design/T-584-landing-directions.md`. Canvas: https://claude.ai/artifact/BUUtog4ppu6xS3Hidid3ou (boards "B · The Reading Desk · desktop 1280" and "phone 390", and "T-599"). Figma: file `Tg2yQ7xE5faLfBgeAQf1Uu`, page Screens, section "09 Landing · The Reading Desk". Tokens of record: `DESIGN.md` (Night and Daylight). Order of authority: `.claude/docs/ui-quality.md` §Order.

Copy: every string marked `[ ]` is a placeholder until Madhuri writes it (`handoff/copy/T-584-copy-brief.md`) and Ajay signs. Strings not in brackets are already signed (T-511, T-317, T-223) and carry over byte for byte. No lead types a new marketing sentence.

## 0. What this replaces and what stays

- Replaces `components/landing/LandingPage.tsx` sections: hero, three steps, document types, trust, FAQ, final CTA, in that order. Keeps the existing `NightTopBar`, `NightFooter`, `NightPlanCard`, `NightFaq`, `DemoFolio` (reworked, §2), `nl-copy.ts` (extended), the Hindi toggle, the SEO fields.
- Adds: coverage drawers (§3), sample drafts (§4), demo video (§5), a generated catalogue file (§3.4).
- Prices and FAQ: unchanged content and components; prices move below the video (§order below).
- Persuade mode (impeccable). The emil set's `animate` and `mobile-native` apply to every section.

Section order, top to bottom: top bar · hero with the drafting demo · how it works · coverage drawers · sample drafts · demo video · Ink and prices · trust · FAQ · final CTA · footer.

## 1. Layout and type

- Column 1180px with 48px side padding from 1280; 24px padding 720 to 1279; 16px below 720. Sections 96px vertical padding at desktop, 56px below 720. Hairline `--line` between sections; alternating sections sit on `--wall` and a deeper shade (`#0b1512` night / `--day-wood` day) as on the canvas.
- Type: h1 Tiro 54/60 (phone 34/40); h2 Tiro 36/44 (phone 28/34); eyebrow Mukta 13 uppercase tracking .08em in `--muted`; lead Mukta 18/28 `--text-soft` (phone 16/26); body 16/26.
- Buttons: `ui/Button` primary (brass) and ghost; 52px tall for the hero and final CTA, 44 to 48 elsewhere. One primary per viewport (DESIGN.md One Primary): in the hero the only brass fill is `Start a free draft`; the top bar's brass CTA hides while the hero CTA is in view (as T-528 built it).
- Both themes from tokens; nothing hard-coded. Contrast computed by the reviewer from hex (ui-quality lesson, 21 Oct).

## 2. Hero: the product performs

Desktop (≥ 900): grid 5fr/7fr, 56px gap, items centred. Left: eyebrow `[ ]`, h1 `[Describe the matter. Read the draft.]`, lead `[ ]`, CTA `Start a free draft`, then two Muted lines: `Free plan: 5 Ink once your email is verified. Prices include GST.` and the signed disclaimer `Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.` Right: the lit folio.

The folio (reworks `DemoFolio`):
- 1280: folio 560px wide, 440px min height, Card `--day-card` paper (#fbf8f0 in both themes: paper is paper), radius 6, shadow `0 18px 50px rgba(0,0,0,.45)` at night, DESIGN.md One Shadow by day. Lamp pool: a radial gradient of `--amber` at 16% centred above the folio, static below 1280 and under reduced motion; from 1280 with `(pointer:fine)` it follows the pointer within ±24px, 120ms linear (spec T-511 motion table, unchanged).
- Inkwell (ui/Inkwell) at the folio's top right with the stage name (Mukta 500 14) and pct (Tiro 24 tabular), exactly the T-539 progress language, driven by the script, not a timer per frame.
- Script (static asset, no model call): the folio writes a fictional regular bail application, lines 1 to 3 of the grounds, pen-writing 2.6s once when the folio enters the viewport (IntersectionObserver, threshold .5), the inkwell draining from 100% to about 54% in step, then holds. The text is a static string in `nl-copy.ts` marked `[fictional sample, Ajay]`. SAMPLE watermark: Tiro 64px, tracking .3em, `rgba(142,47,47,.18)`, rotated −24°, bordered, centred, `pointer-events:none`, present in every state.
- Reduced motion or `prefers-reduced-data`/Save-Data: the finished three lines and the inkwell at 54%, nothing moves. Tab hidden: paused, resumes.
- Phone (< 900): one column; copy, CTA, the two Muted lines, then inkwell row (34px icon + stage + pct), then the folio full width (16px gutter), 300px min height, 22px padding; the demo runs once in view. Phone budget: no lamp follow, no shadow blur above 24px, the demo is the only animation on the first screen.
- States: the demo is scripted and has no error state. If `IntersectionObserver` is missing, render the finished state.

## 3. Coverage: the card catalogue

- Section on the deeper ground. Eyebrow `What we draft`; h2 `[Twenty drawers. Every template in the library.]`; lead `[ ]`.
- Drawers: `ui/Card` variant "drawer": 1280 four columns, 16px gap; 720 to 1279 three; below 720 two columns, 10px gap. Each drawer: name (Mukta 500 15/20), count `{n} drafts` (Mukta 13 Muted, tabular), a brass pull (40×6, radius 3) centred at the bottom; min height 92 (84 on phones); Card fill, Line border, radius 6. It is a `<button aria-expanded>`; the open drawer takes `--brass-soft` fill and a Brass border.
- Open panel: one panel under the grid (not inside it, so the grid does not reflow): Brass border, Card fill, radius 8, 28/32 padding (18 on phones). Header `{name} · {n} drafts` Brass Text 14/500; the templates as a 3-column list at 1280 (2 at 720, 1 on phones), Mukta 16, each row with a Line hairline. The first drawer is open on load. Opening another: 200ms ease-out height and opacity; under reduced motion instant. Only one open at a time. Keyboard: drawers are in one tab sequence; Enter/Space open; the panel follows in DOM order so the reader lands on the list.
- Footer line under the panel: `{total} drafts on {shelves} shelves today.` in Text Soft 500 + `[ ]` Muted.
- 3.4 **Generated list.** The drawers are rendered from a generated JSON produced at build time from `apps/drafting/src/config/catalogue` (categories.ts for names and order, the batches for ids and categories), through a script in `apps/web` (or a shared package, Arjun's call), never typed by hand. The count excludes aliases (`DOC_TYPE_ALIASES`) and disabled or hidden templates; Arjun defines "shown" (the base batch has 92 entries where the ticket says 86). Display names: the template's display title from `template-configs`, not the id. Categories with zero templates are not rendered. A test pins that the JSON equals the catalogue (fails when a template is added without regenerating).
- Hindi: the category names and template titles need Hindi strings before the toggle shows them; until then the toggle keeps English in this section and Madhuri's brief lists it.

## 4. Sample drafts

- Section on `--wall`. Eyebrow `Sample drafts`; h2 `[Three drafts left on the desk for you to read.]`; lead `[ ]`.
- The desk: a `--wood` panel, radius 12, 48px padding (20/16 on phones), inset 1px Line, a lamp gradient from the top (static). Three folios in a 3-column grid (28px gap); on phones a horizontal scroll row of 240px folios with scroll-snap, 14px gap, scrollbar hidden, the row scrollable by keyboard as a list of links.
- Folio: `<a>` to the sample's PDF (static file), paper #fbf8f0, radius 6, 26px padding, min height 340: category eyebrow (11px uppercase Muted-on-paper #5c685f), title Tiro 18, a 3-line summary 14/22, meta line `{pages} pages · {language} · {format}` #5c685f, SAMPLE watermark as §2. Desk tilt: −1.2°, 0 with −10px lift, +1°; none on phones. Hover (pointer fine): translateY −2px 150ms; no lift under reduced motion.
- Assets: three PDFs under `apps/web/public/samples/` produced once from the product with fictional parties, redacted, the watermark baked into every page, reviewed by Ajay; names and facts in the summaries are Madhuri's and Ajay's. No live call; no "generated for you".
- Empty/loading: none, the assets are static. If a PDF 404s the link still opens the browser's error; acceptable, the tester checks the three URLs.

## 5. Demo video

- Section on `--wall` after samples. Header row: eyebrow `The long version`, h2 `[One draft, start to seal, in ninety seconds.]`, right-aligned Muted note `[Real product, fictional parties. Captions. Loads on play.]`.
- Player: 16:9, radius 8, Line border. Poster image (`<img loading="lazy">`, WebP ≤ 120KB, 1280×720, the lit folio with no faces and no client data) with a 96px brass play button (`<button aria-label="Play the demo video">`, 64 on phones) and two chips bottom-left: `CC English · हिंदी` (Brass Soft) and the duration. Pressing play swaps in `<video controls preload="none" playsinline>` with `<track kind="captions">` for both languages and the poster as `poster`; the file is a static MP4 (H.264, ≤ 8MB, 1280×720) from `public/` or the CDN, never autoplay, sound only after the press. The poster stays as the fallback when `<video>` is unsupported.
- Reduced motion: unchanged (video plays only on request). Phone budget: nothing loads before the press except the poster.
- Who records it is open with the founder; the spec does not change with that answer.

## 6. Ink and prices, trust, FAQ, final CTA, footer

Carry over from T-511/T-528 as built (NightPlanCard ×3, price Tiro 34/40, `Prices include GST`, `A failed draft does not use Ink. Plan Ink does not carry over.`; trust three columns `[ ]`; NightFaq with the signed disclaimer answer open; final CTA h2 `[Sit down. Describe the matter.]` + `Start a free draft`; NightFooter with the disclaimer line and the legal links, `Case diary and reminders: coming`). No change beyond their position.

## 7. Motion summary (emil set)

| Element | Motion | Reduced motion | Phone |
|---|---|---|---|
| Hero folio | pen-writing 2.6s once in view, inkwell in step | finished state | once, in view only |
| Lamp pool | follows pointer 120ms linear, 1280 + fine pointer | static | static |
| Drawers | 200ms ease-out open/close | instant | same |
| Sample folio hover | translateY −2px 150ms | none | no hover |
| Video | none until pressed | same | same |
| Wordmark ink-fill (T-599, pending founder) | 600ms once per tab session | static | same |

Nothing on the page moves on a timer after first view. Budget: the landing ships two font files, three WebP posters at most, the sample PDFs and the MP4 behind a press; JS for the demo and drawers only.

## 8. States on this page

Loading: the hero folio renders its finished state server-side so a slow script never shows an empty folio; drawers render with the first open. Error: none of the sections fetch; the 404s of static files are the tester's URL check. Empty: a category with zero templates is not rendered; if the generated JSON is empty the section does not render and the build test fails first.

## 9. Acceptance (Playwright, 390/768/1280, both themes)

1. The hero CTA is the only brass-filled control in the first viewport; the top bar CTA appears after the hero scrolls out.
2. The folio's finished state is visible with reduced motion on; with motion on, the inkwell reaches ~54% once and holds.
3. Drawers: 20 render from the generated JSON; the first is open; opening another closes it; keyboard reaches every drawer and the panel; `aria-expanded` is correct.
4. The total equals the catalogue after aliases/disabled are excluded (unit test on the generator).
5. Three sample links return 200 and each PDF carries the SAMPLE watermark on every page (one visual check per PDF).
6. The video element does not exist before play; after play it has two caption tracks and `preload="none"` was honoured.
7. Contrast of every text/background pair computed from hex ≥ 4.5:1 (reviewer prints the ratios).
8. Lighthouse mobile performance ≥ 85 on the deployed develop page with the posters in place.

## 10. T-599: the other marketing pages

- **Legal pages (privacy, terms, refunds): Read mode, restyle only.** NightTopBar and NightFooter; from 1024 a 200px contents rail (sticky, Muted 13/28, current section Text with a 2px Brass left mark) and a 65ch article; below 1024 a "Contents" disclosure above the text. Article: eyebrow with the page name and `version unchanged`, Tiro h2 30/36, Tiro h3 21, Mukta 16/27 Text Soft, links Brass Text underlined, lists keep their numbering. Wording and the "last updated" date byte-identical; the privacy version is not bumped by this change; Ajay diffs the rendered text once.
- **Free tools (tools index, bail-checker, section-converter, timeline-tracker): Operate inside Persuade.** Form on `ui/Card` with Night `ui/Input`, Select and `ui/Button` primary (one per form); the result on a paper folio (as §4, no watermark) with the T-317 tool disclaimer unchanged under the form. Same functions and tests; only the shell changes. The tools index lists the three as a shelf of three spines (ui/Spine) with one line each.
- **About, FAQ, Contact:** the same frame; FAQ reuses NightFaq; Contact's form is a Card with Night inputs and one primary.
- **Migration order and mechanics:** privacy → tools → about → faq → contact → terms → refunds; one path added to `NIGHT_LIBRARY_MARKETING_PATHS` per step with a screenshot pair; `.mk` styles and the Inter/Lora/Fraunces font variables removed after refunds. One lead, one ticket per step or one ticket with seven commits, Priya's call.
- **Logo splash (PENDING FOUNDER YES, specified as proposed):** no full-screen overlay returns; `LogoSplash.tsx` retires. (1) The wordmark in the hero and the top bar ink-fills once on first paint: `background-clip:text` from Brass Text to a 25% Brass Text, 600ms ease-out, CSS only; `animation-play-state: paused` while `document.hidden`; static under reduced motion; once per tab session (sessionStorage, blocked storage counts as "not seen" as T-339). (2) The same fill is the app loading screen between sign-in and the shelf and on a cold dashboard load, its width tied to real progress (`/me`, shelf) and capped at 1.2s, then the shelf skeleton. Never on legal pages, free tools or inside the editor. The consent notice keeps waiting for the splash-end event; the new component fires the same event on fill end (or at once under reduced motion). If the founder says no, the hero keeps a static wordmark and only the loading screen is built.

## 11. Open items

- Founder: yes/no on the logo fill (§10); who records the video (§5).
- Arjun: where the catalogue generator lives and the definition of "shown" (§3.4); CDN or `public/` for the MP4 (§5).
- Madhuri: `handoff/copy/T-584-copy-brief.md`. Ajay: signs after Madhuri; reviews the three sample PDFs and the video's on-screen text.
