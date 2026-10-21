---
name: Lawie
description: A chambers library after hours, where an advocate's draft is written in front of them.
colors:
  wall: '#0e1a17'
  wood: '#15241f'
  card: '#182a24'
  text: '#efe7d4'
  text-soft: '#cbc2ac'
  muted: '#8e9a8e'
  line: '#2a3c35'
  brass: '#c9a24a'
  brass-text: '#e6c877'
  brass-soft: '#2b2614'
  brass-mark: '#c9a24a'
  on-brass: '#15241f'
  oxblood: '#7a2a2a'
  oxblood-high: '#a94545'
  moss: '#7fcfa8'
  moss-soft: '#143327'
  rust: '#f2a196'
  rust-soft: '#3b1a17'
  amber: '#f1d08a'
  amber-soft: '#3a2e12'
  day-wall: '#f3efe4'
  day-wood: '#e9e2d1'
  day-card: '#fbf8f0'
  day-text: '#1c2a25'
  day-text-soft: '#3d4c46'
  day-muted: '#5c685f'
  day-line: '#d9d1be'
  day-brass: '#866619'
  day-brass-text: '#6e5415'
  day-brass-soft: '#f6ebcf'
  day-brass-mark: '#e6c877'
  day-on-brass: '#ffffff'
  day-oxblood: '#8e2f2f'
  day-oxblood-high: '#b85050'
  day-moss: '#1b7658'
  day-moss-soft: '#ddf2e8'
  day-rust: '#b3261e'
  day-rust-soft: '#fce9e7'
  day-amber: '#7a5300'
  day-amber-soft: '#fbefd2'
typography:
  display:
    fontFamily: 'Tiro Devanagari Hindi, Nirmala UI, Kohinoor Devanagari, Noto Sans Devanagari, serif'
    fontSize: 'clamp(48px, 5.3vw, 68px)'
    fontWeight: 400
    lineHeight: 1.08
    letterSpacing: '0'
  headline:
    fontFamily: 'Tiro Devanagari Hindi, Nirmala UI, Kohinoor Devanagari, Noto Sans Devanagari, serif'
    fontSize: '32px'
    fontWeight: 400
    lineHeight: '38px'
  title:
    fontFamily: 'Tiro Devanagari Hindi, Nirmala UI, Kohinoor Devanagari, Noto Sans Devanagari, serif'
    fontSize: '24px'
    fontWeight: 400
    lineHeight: '30px'
  subtitle:
    fontFamily: 'Mukta, Nirmala UI, Kohinoor Devanagari, Noto Sans Devanagari, system-ui, sans-serif'
    fontSize: '18px'
    fontWeight: 500
    lineHeight: '26px'
  body:
    fontFamily: 'Mukta, Nirmala UI, Kohinoor Devanagari, Noto Sans Devanagari, system-ui, sans-serif'
    fontSize: '16px'
    fontWeight: 400
    lineHeight: '26px'
  body-sm:
    fontFamily: 'Mukta, Nirmala UI, Kohinoor Devanagari, Noto Sans Devanagari, system-ui, sans-serif'
    fontSize: '14px'
    fontWeight: 400
    lineHeight: '22px'
  label:
    fontFamily: 'Mukta, Nirmala UI, Kohinoor Devanagari, Noto Sans Devanagari, system-ui, sans-serif'
    fontSize: '12px'
    fontWeight: 500
    lineHeight: '16px'
    letterSpacing: '0.12em'
  draft:
    fontFamily: 'Mukta, Nirmala UI, Kohinoor Devanagari, Noto Sans Devanagari, system-ui, sans-serif'
    fontSize: '16px'
    fontWeight: 400
    lineHeight: '28px'
    fontFeature: 'tnum'
rounded:
  none: '0px'
  sm: '2px'
  md: '4px'
  pill: '999px'
spacing:
  '1': '4px'
  '2': '8px'
  '3': '12px'
  '4': '16px'
  '5': '20px'
  '6': '24px'
  '8': '32px'
  '10': '40px'
  '12': '48px'
  '16': '64px'
components:
  button-primary:
    backgroundColor: '{colors.brass}'
    textColor: '{colors.on-brass}'
    typography: '{typography.body}'
    rounded: '{rounded.md}'
    padding: '0 20px'
    height: '44px'
  button-ghost:
    backgroundColor: 'transparent'
    textColor: '{colors.brass-text}'
    typography: '{typography.body}'
    rounded: '{rounded.md}'
    padding: '0 20px'
    height: '44px'
  button-destructive:
    backgroundColor: '{colors.oxblood}'
    textColor: '#ffffff'
    typography: '{typography.body}'
    rounded: '{rounded.md}'
    padding: '0 20px'
    height: '44px'
  button-sm:
    rounded: '{rounded.md}'
    padding: '0 16px'
    height: '36px'
  chip:
    backgroundColor: '{colors.brass-soft}'
    textColor: '{colors.brass-text}'
    typography: '{typography.label}'
    rounded: '{rounded.pill}'
    padding: '4px 10px'
  card:
    backgroundColor: '{colors.card}'
    textColor: '{colors.text}'
    rounded: '{rounded.none}'
    padding: '{spacing.4}'
  folio:
    backgroundColor: '{colors.card}'
    textColor: '{colors.text}'
    rounded: '{rounded.none}'
    padding: '{spacing.6}'
  input:
    backgroundColor: 'transparent'
    textColor: '{colors.text}'
    typography: '{typography.body}'
    rounded: '{rounded.none}'
    padding: '8px 0'
    height: '44px'
  input-boxed:
    backgroundColor: '{colors.card}'
    textColor: '{colors.text}'
    typography: '{typography.body}'
    rounded: '{rounded.md}'
    padding: '8px 12px'
    height: '44px'
  top-bar:
    backgroundColor: '{colors.wall}'
    textColor: '{colors.text}'
    height: '64px'
    padding: '0 16px'
  dialog:
    backgroundColor: '{colors.card}'
    textColor: '{colors.text}'
    rounded: '{rounded.md}'
    padding: '{spacing.6}'
    width: '440px'
---

# Design System: Lawie

Owner: Rajesh (design). Signed 21 Oct 2026; Daylight brass, muted and moss re-signed 21 Oct 2026 after Tanvi's contrast audit (T-524). Every text pair in both themes clears WCAG AA 4.5:1, including On Brass on Brass (5.4:1 day) and each status text on its soft fill. Source of record for the T-511 system; the long-form screen spec is `handoff/design/T-511-night-library-spec.md`, the Figma file is https://www.figma.com/design/Tg2yQ7xE5faLfBgeAQf1Uu, and the live tokens are `apps/web/src/app/globals.css` (`.nl`). Where these disagree, this file wins and I fix the others. Frontmatter colours are the Night values; the `day-*` keys are the Daylight values of the same tokens. In code they are one set of CSS variables switched by `html[data-theme]`.

## Overview

**Creative North Star: "The Night Library"**

A chambers library after hours. Deep green walls, brass and oxblood, one reading lamp, and the advocate's documents standing on a shelf as books. Drafting happens on a lit folio: the description is typed, ink drains from the well while Lawie works, the draft is written in, and a brass seal lands when the advocate finalises. The room is quiet and warm; nothing on screen shouts, because the advocate is already tired and the work is serious.

Daylight is the same room with the curtains open, not an inverted palette. Both themes are complete designs at AA contrast. The default follows the system theme; the advocate can pin Night, Daylight or System and the choice is remembered. Dark is never forced.

The system is paper-and-ink, not glass-and-gradient. Surfaces are flat, square-cornered and hairline-bordered. Depth comes from one card shadow and the lamp pool, never from stacked elevations. Motion is literal and rare: ink drains, a pen writes, a seal stamps, a book slides out. Everything else is still.

**Key Characteristics:**

- One accent (brass) for action, used sparingly; oxblood only for books and destructive confirms.
- Square corners (0 to 4px); pills only for chips.
- Serif display (Tiro Devanagari Hindi) above 20px, humanist sans (Mukta) below, both carrying Devanagari natively.
- Four signature objects: the folio, the inkwell, the seal, the shelf of spines.
- Mobile first at 360px; every effect degrades to a still image on phones, under reduced motion, and when the tab is hidden.

## Colors

Warm darks with a single brass accent; Daylight keeps the hues and lifts the lightness.

### Primary

- **Brass** (#c9a24a night / #866619 day): the one action colour. Primary button fill, the seal, the lamp dot, the focus ring, the ink in the well. On any screen it should cover under ten percent of the pixels.
- **Brass Text** (#e6c877 / #6e5415): the text form of brass. Eyebrows, links, ghost-button labels, chip text. This exists because brass fill fails contrast as small text.
- **Brass Soft** (#2b2614 / #f6ebcf): chip fills, the hover halo, the selected row in the command bar list.
- **On Brass** (#15241f / #ffffff): text on a brass fill.
- **Brass Mark** (#c9a24a / #e6c877): the spine bands and the seal mark on an oxblood spine, and any other brass mark drawn on a dark fill. Same as Brass at night; by day it stays light so it clears 3:1 on Oxblood (5.0:1). Never used on Wall or Card. The inner ring of a seal mark on a spine is the spine's own fill (Oxblood), not On Brass, so it stays visible in both themes; only the 100px seal on the folio uses the On Brass ring.

### Secondary

- **Oxblood** (#7a2a2a / #8e2f2f) and **Oxblood High** (#a94545 / #b85050): book spines on the shelf and the destructive confirm button. Never a status colour.

### Neutral

- **Wall** (#0e1a17 / #f3efe4): the page ground.
- **Wood** (#15241f / #e9e2d1): the shelf edge, skeleton blocks, dividers that need a surface.
- **Card** (#182a24 / #fbf8f0): the folio, cards, inputs, dialogs, popovers.
- **Text** (#efe7d4 / #1c2a25): body and headings. 12.9:1 on Card at night, 13.6:1 by day.
- **Text Soft** (#cbc2ac / #3d4c46): secondary text, descriptions. 9.6:1 / 9.2:1.
- **Muted** (#8e9a8e / #5c685f): labels, captions, placeholders. 5.1:1 night on Card, 5.5:1 day on Card, 4.5:1 day on Wood; never below 12px and never as body text.
- **Line** (#2a3c35 / #d9d1be): the hairline on every card, input and divider.

### Status

- **Moss** (#7fcfa8 / #1b7658) on **Moss Soft** (#143327 / #ddf2e8): success, finalised, Ink used.
- **Amber** (#f1d08a / #7a5300) on **Amber Soft** (#3a2e12 / #fbefd2): open checks, low Ink, gates (verify email, privacy).
- **Rust** (#f2a196 / #b3261e) on **Rust Soft** (#3b1a17 / #fce9e7): errors, failed payment, offline.
- **Lamp** (rgba(255,214,140,.22) / rgba(255,200,90,.16)): the radial pool of light on the folio and hero. A gradient only, never a fill.
- **Selection** (#332a14 / #f3e9c8): `::selection` background, text colour unchanged. Text 11.5:1 / 12.3:1, Muted 4.8:1 / 4.8:1, Brass Text 8.7:1 / 5.9:1. The caret is Brass (`caret-color`). The browser chrome (`<meta name="theme-color">`) is Wall for the resolved theme, #0e1a17 night and #f3efe4 day, and follows the toggle.

### Named Rules

**The Brass Is Not Text Rule.** Brass fill (#c9a24a / #866619) is never used for text under 20px. Brass Text is the text form; the two are different tokens on purpose.

**The One Primary Rule.** One brass-filled button per screen. Everything else is ghost or a link.

**The Status Pair Rule.** A status colour is always used as its text token on its soft token, or as its text token on Card. Never as a fill behind white text.

## Typography

**Display Font:** Tiro Devanagari Hindi 400 (with Nirmala UI, Kohinoor Devanagari, Noto Sans Devanagari, serif)
**Body Font:** Mukta 400 and 500 (with Nirmala UI, Kohinoor Devanagari, Noto Sans Devanagari, system-ui, sans-serif)

**Character:** A court serif for the headings an advocate reads once, a plain humanist sans for everything they read all day. Both faces carry Devanagari natively, so a Hindi screen is set in the same system with no fallback seam. Two weights of Mukta are loaded, nothing else.

### Hierarchy

- **Display** (400, clamp(48px, 5.3vw, 68px), 52px to 72px): the landing hero only.
- **Headline** (400, 32px, 38px): page titles ("Your shelf", "Settings").
- **Title** (400, 24px, 30px): section titles, dialog titles, KPI numbers (40px on the dashboard, same face).
- **Subtitle** (Mukta 500, 18px, 26px): card titles and anything that is a heading under 20px.
- **Body** (400, 16px, 26px): the default. Running text stays at or under 65 characters a line.
- **Body Small** (400, 14px, 22px): secondary lines, captions, help text, chips with words.
- **Label** (500, 12px, 16px, 0.12em, uppercase): eyebrows and card keys, in Brass Text or Muted.
- **Draft** (400, 16px, 28px, tabular numerals, max 65ch): the draft on the folio and in the editor.

### Named Rules

**The Twenty Pixel Rule.** Headings at 20px and above are Tiro; below 20px they are Mukta 500. There is no third face and no third weight.

**The Tabular Rule.** Every number that can sit in a column (Ink, counts, dates, prices) is set with tabular numerals.

## Layout

A single reading column that widens into a desk. At 360px everything is one column with a 16px gutter; at 640px and above dialogs stop being bottom sheets; at 900px the dashboard KPI grid goes from two columns to four and the editor gains its right-hand checks rail (320px); at 1280px the content sits in a 1180px column with 48px side padding. The hero is two columns from 900px (copy left, folio right) and one column below, folio directly under the headline. Full-width sections (three steps, prices, trust, FAQ, the final call) fill the column with equal tracks; the document-type shelf and the dashboard shelf hug their spines, left-aligned, with the wood edge running the full column width. The space to the right of a shelf is intended.

Spacing uses the 4px scale (4, 8, 12, 16, 20, 24, 32, 40, 48, 64). Cards pad 16px; the folio pads 24px on phones and 40px on desktop; sections sit 44px to 72px apart. Touch targets are 44px minimum, including the 36px small button, whose hit area is padded out to 44px.

The shelf is a horizontal strip of 52px-wide spines with a 6px gap on a 10px wood edge; it scrolls sideways at 360px and shows a visible edge, so the scroll is discoverable. Nothing is hidden behind hover: a spine's label, matter and status are in its text and its accessible name.

## Elevation & Depth

Flat at rest, with two exceptions. Every surface is Card on Wall with a 1px Line border and no shadow. The folio and the command bar carry the one card shadow, because they are the object on the desk. The lamp pool is a radial gradient behind the folio and the hero, static on phones and following the pointer on a fine-pointer desktop. Hover on a primary button adds a 4px Brass Soft halo and a 1px lift; nothing else lifts.

### Shadow Vocabulary

- **Card** (`0 20px 50px -24px rgba(0,0,0,.9)` night, `0 20px 50px -28px rgba(28,42,37,.45)` day): the folio, the command bar, toasts and popovers.
- **Halo** (`0 0 0 4px var(--brass-light)`): primary button hover.
- **Seal drop** (`0 6px 10px rgba(0,0,0,.4)`): the brass seal only.

### Named Rules

**The One Shadow Rule.** There is one card shadow and it belongs to the object the advocate is working on. Two shadowed things on one screen is one too many.

**The No Nested Card Rule.** Cards do not sit inside cards. Inside the folio, structure is spacing and hairlines.

## Shapes

Square paper, round seals. Cards, the folio, inputs, banners and dialogs have no radius or 4px at most; the 2px step is for keyboard hints and small tags. Chips, the Ink dot and the seal are fully round. Borders are 1px Line on every container; a 1px brass hairline rules the top of the folio and the command bar. Underline inputs on the folio (border-bottom only, 2px brass on focus); boxed inputs in Settings forms (1px Line, 4px radius). Bottom sheets at 360px take a 12px top radius and a 40px drag handle; that is the only large radius in the system.

Focus is a 2px brass outline offset 3px, on every interactive element, in both themes.

## Components

### Buttons

Quiet until pressed; the brass one is the only loud thing on the page.

- **Shape:** gently squared (4px radius), 44px tall, 20px side padding; small variant 36px tall, 16px padding, hit area padded to 44px.
- **Primary:** Brass fill, On Brass label, Mukta 500 15px.
- **Ghost:** transparent, Brass Text label, 1px Line border.
- **Destructive:** Oxblood fill, white label; sits last in a dialog, after the ghost safe action.
- **Hover / Focus:** hover lifts 1px with the 4px Brass Soft halo, 150ms ease; focus is the system ring. Disabled is opacity .5. Loading swaps the label for a spinner and holds the width.

### Chips

- **Style:** pill, 12px Mukta 500, 4px by 10px padding. Neutral is Text Soft on a Line border; brass, moss, amber and rust tones use the status pair. The Ink chip carries a brass dot before the number.
- **State:** static. Chips never act as buttons; the quick chips under the command bar are buttons styled as chips and say so in their role.

### Cards / Containers

- **Corner Style:** square (0px).
- **Background:** Card on Wall.
- **Shadow Strategy:** none, except the folio and command bar (see Elevation).
- **Border:** 1px Line; Rust on an error card.
- **Internal Padding:** 16px; the folio 24px to 40px.
- **States:** loading shows Wood skeleton blocks with a 1.4s pulse; empty is one sentence and one action; error is a Rust border, one sentence and Retry. A loading card never renders a zero.

### Inputs / Fields

- **Style:** on the folio, underline only (1px Line); in Settings, boxed (1px Line, 4px radius, Card fill). Label above in Label style, Brass Text.
- **Focus:** bottom border becomes 2px brass; the system ring applies on keyboard focus.
- **Error / Disabled:** Rust border and a one-line message naming the fix, linked by aria-describedby; disabled is opacity .5.

### Navigation (Top bar)

- 64px, Wall fill, 1px Line bottom. The Lawie mark is Tiro 26px with a brass lamp dot and a soft glow. Signed-in: Ink chip, theme toggle, avatar menu. Below 720px the nav and the theme toggle fold into the menu; the Ink chip stays visible. Sticky, respects the top safe-area inset.

### Command bar (signature)

The question at the top of the desk: "What do you need to draft?" in Title type, an underline input with a Ctrl K hint and the one primary button. A Radix Popover with our own listbox opens below: quick chips while empty, matching templates and the advocate's own drafts while typing, one line when nothing matches. Ctrl K and Cmd K focus it from anywhere; Escape closes.

### Folio, Inkwell, Seal, Spine (signature)

- **Folio:** the lit sheet of paper. Card fill, card shadow, brass hairline on top, Draft type inside.
- **Inkwell:** a 52 by 64 SVG; the level rect is the Ink balance. While a draft generates it drains once over 2.6s to an 8% line and holds; static at 60% under reduced motion.
- **Seal:** 100px brass disc, On Brass Tiro lettering, resting at -8°. Stamps in from scale 2.2 and -20° over 550ms with the seal drop shadow; a 150ms fade under reduced motion. A 26px mark of it sits on finalised spines.
- **Spine:** 52px wide, 184 to 210px tall, Tiro 15px label set vertically, two Brass Mark bands for a draft with open checks, the Brass Mark seal for a finalised document. Hover or focus pulls it out 14px over 250ms on desktop only.

### Dialog and Toast

- **Dialog:** 440px centred on desktop; full-width bottom sheet at 640px and below. Title in Title type, body in Body Soft, safe action ghost first, confirm last. First focus lands on the safe action.
- **Toast:** Card fill, card shadow, bottom centre on phones and bottom right on desktop, 200ms in and out. Info and success close after 6s; error stays until closed.

## Do's and Don'ts

### Do:

- **Do** set every number with tabular numerals and keep Ink as a number plus the word Ink (never a draft count).
- **Do** build both themes from the same token names; a component that reads one literal colour is a bug.
- **Do** keep the lamp follow and the dust motes behind `(pointer: fine) and (min-width: 900px)`, and pause every loop on `visibilitychange`.
- **Do** give every screen its loading, empty and error state before it ships, with Retry on every error.
- **Do** keep running text at or under 65 characters a line and Muted text at 12px or larger.
- **Do** show a status in text as well as colour (the spine's label, the chip's words).

### Don't:

- **Don't** use brass fill as text, or any colour but Brass Text for links.
- **Don't** put two brass-filled buttons on one screen.
- **Don't** round a card, the folio, an input or a dialog beyond 4px; pills are for chips and the seal.
- **Don't** add a shadow, a gradient or a glass effect anywhere the system does not name one.
- **Don't** nest a card in a card, or a border inside a border.
- **Don't** add a third typeface, a third Mukta weight, or an icon font; icons are inline SVG at 16 to 24px.
- **Don't** let an effect be the only cue: hover, the lamp and the pen are decoration, never information.
- **Don't** write copy into a component; signed copy comes in as props from the Ajay-signed copy files.
