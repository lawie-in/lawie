# T-511 hand-off spec: Night Library, the V1 UI

| Field    | Value |
| -------- | ----- |
| Author   | Rajesh (designer) |
| Approvers | Arjun (feasibility, fonts, library), Meera and Madhuri (copy), Ajay (claims) |
| Figma    | https://www.figma.com/design/Tg2yQ7xE5faLfBgeAQf1Uu |
| Previews | Night Library https://claude.ai/artifact/X74JSErpC6Qy7Eft2VebJV (the founder's pick, 17 Oct 2026). Other concepts: Chambers https://claude.ai/artifact/P1WUuhgH9NNRrZ7e2ZpbFT, Court Diary https://claude.ai/artifact/WAD3Vzn1jHaZxvbfBshsUE, Living Docket https://claude.ai/artifact/A3S4wyqBzv9EU7XZmJKMVS |
| Tickets  | T-511 (redesign), T-509 (plan chooser, cancel, status), T-510 (error states, dead buttons) |
| Date     | 2026-10-17 |
| Supersedes | T-005 section 3 (tokens). T-005 flow, screens and rules still apply; this spec reskins them. |

Every string in this spec is placeholder copy until Meera and Madhuri write it and Ajay signs. Claims are workflow only. Nothing in the UI says "court-ready", "accurate", "never miss", gives a time saved, a draft count, "unlimited", a ranking or a testimonial about results. CRM features are "coming", never sold.

## 1. The idea

A chambers library after hours. Deep green walls, brass and oxblood, one reading lamp. The advocate's documents are books on a shelf. Drafting happens on a lit folio: the description is typed, ink drains from the well while Lawie works, the pen writes the draft in, and a brass seal lands when the advocate finalises.

Daylight is the same room with the curtains open, not an inverted palette. Both themes ship. **Default: follow the system theme; a Night / Daylight / System toggle sits in the top bar and in Settings, and the choice is remembered** (localStorage, and on the user record once T-507 lands). Dark is never forced (Priya, 17 Oct 2026). Daylight is a full design at AA contrast, and the landing page is checked in both themes before Anushka's pass.

## 2. Tokens, one source of truth

Figma variables are the source. The web lead exports them to CSS custom properties with the names below and deletes the shadcn HSL set, the old brand set and the stale lawie blue scale (checklist: one colour source).

### 2.1 Colour (collection `Color`, modes Night and Daylight)

| Token | CSS | Night | Daylight | Use |
| --- | --- | --- | --- | --- |
| bg/wall | `--bg-wall` | #0E1A17 | #F3EFE4 | page ground |
| bg/wood | `--bg-wood` | #15241F | #E9E2D1 | shelf, dividers, skeletons |
| bg/card | `--bg-card` | #182A24 | #FBF8F0 | folio, cards, inputs |
| text/primary | `--text` | #EFE7D4 | #1C2A25 | body and headings |
| text/soft | `--text-soft` | #CBC2AC | #3D4C46 | secondary text |
| text/muted | `--muted` | #8E9A8E | #6D7A73 | labels, captions (min 14px) |
| border/line | `--line` | #2A3C35 | #D9D1BE | hairlines, inputs |
| brass/fill | `--brass` | #C9A24A | #9C7A2B | primary button fill, seal, lamp dot, focus ring |
| brass/text | `--brass-dark` | #E6C877 | #6E5415 | eyebrows, links, ghost button text |
| brass/soft | `--brass-light` | #2B2614 | #F6EBCF | chip fills, hover halo |
| on-brass | `--on-brass` | #15241F | #FFFFFF | text on brass fill |
| ox/fill, ox/hi | `--ox`, `--ox-hi` | #7A2A2A, #A94545 | #8E2F2F, #B85050 | book spines, destructive confirm |
| ok/text, ok/soft | `--ok`, `--ok-light` | #7FCFA8, #143327 | #1E7F5F, #DDF2E8 | success chips, finalised |
| error/text, error/soft | `--err`, `--err-light` | #F2A196, #3B1A17 | #B3261E, #FCE9E7 | errors, failed payment |
| warn/text, warn/soft | `--warn`, `--warn-light` | #F1D08A, #3A2E12 | #7A5300, #FBEFD2 | open checks, low Ink |
| lamp | `--lamp` | rgba(255,214,140,.22) | rgba(255,200,90,.16) | the lamp pool, radial gradient only |

Contrast (WCAG AA, body text 4.5:1): text/primary on bg/card is 12.9:1 night, 13.6:1 day; text/soft 9.6:1 / 9.2:1; text/muted 4.6:1 / 4.6:1 (so muted is never below 14px); brass/text on bg/card 8.6:1 / 5.9:1; on-brass on brass/fill 7.9:1 (night) and 4.6:1 (day, white on #9C7A2B). Brass fill is never small text; brass/text is the text variant. Ok, error and warn text tokens are chosen to clear 4.5:1 on their soft fills and on bg/card.

### 2.2 Spacing and radius (collection `Spacing`)

`space/1..16` = 4, 8, 12, 16, 20, 24, 32, 40, 48, 64. Radius: `none` 0 (cards, folio), `sm` 2, `md` 4 (buttons, inputs), `pill` 999 (chips). Hairline 1px. Card border 1px `border/line`. Shadow: `0 20px 50px -24px rgba(0,0,0,.9)` night, `0 20px 50px -28px rgba(28,42,37,.45)` day.

### 2.3 Type (Arjun, 17 Oct)

- Body: **Mukta** 400 and 500 only, Latin and Devanagari subsets, via `next/font`, `display: swap`. Fallbacks: Nirmala UI, Kohinoor Devanagari, Noto Sans Devanagari, system-ui.
- Headings 20px and above: **Tiro Devanagari Hindi** 400 only. Below 20px headings use Mukta 500.
- Preview used Cormorant Garamond and Source Sans 3; replace, do not mix.

| Style | Font | Size/line | Use |
| --- | --- | --- | --- |
| display | Tiro 400 | 48/52 mobile, 68/72 desktop, letter-spacing 0 | landing hero only |
| h1 | Tiro 400 | 32/38 | page titles |
| h2 | Tiro 400 | 24/30 | section titles, KPI numbers |
| h3 | Mukta 500 | 18/26 | card titles |
| body | Mukta 400 | 16/26 | default |
| body-sm | Mukta 400 | 14/22 | secondary, captions |
| label | Mukta 500 | 12/16, letter-spacing .12em, uppercase | eyebrows, card keys (brass/text or text/muted) |
| draft | Mukta 400 | 16/28, 65ch max | the draft on the folio; `font-variant-numeric: tabular-nums` on numbers everywhere |

Hindi: `lang="hi"` on the root switches nothing in CSS (Mukta carries both scripts). Line height stays 26 at 16px; Devanagari ascenders fit.

### 2.4 Motion

| Name | Duration | Easing | Reduced motion |
| --- | --- | --- | --- |
| hover lift | 150ms | ease | none |
| focus halo | 150ms | ease | instant |
| lamp follow | 120ms | linear; only when `(pointer: fine)` and width ≥ 900 | static pool at 70% 20% |
| dust motes | 12–20s drift loop, 6–10 motes, opacity ≤ .25 | linear; `(pointer: fine)` and width ≥ 900 only; CSS or a 1 KB canvas | none |
| ink drain | 2.6s | linear, matches the generate request | static at 60% |
| pen writing | 12-14ms per character, 220ms between paragraphs; 9ms on mobile | linear | draft appears whole |
| brass seal | 550ms | cubic-bezier(.2,.9,.3,1.2), scale 2.2 to 1, rotate -20 to -8 | fade 150ms |
| spine pull | 250ms | ease, translateY -14px | none |
| skeleton pulse | 1.4s | ease-in-out loop | static |
| toast in/out | 200ms | ease | fade |

Mobile cap (`max-width: 640px` or no fine pointer): no lamp follow, no dust motes, no spine hover, no pen cursor; the lamp pool stays fixed at the top, the inkwell gauge, the spine slide-in and the seal stay. Typing speed 9ms, seal and flip durations halved. `prefers-reduced-motion: reduce` disables all of the above and shows end states. Every loop (ink drain, typing, motes, skeleton pulse) pauses on `visibilitychange` when the tab is hidden and resumes on return. All effects are CSS or a small canvas; no motion library.

### 2.5 Focus and keyboard

Focus ring: 2px `brass/fill`, offset 3px, on every interactive element. Ctrl+K and Cmd+K focus the command bar from anywhere in the app. Escape closes the popover. Tab order follows reading order. Touch targets 44px minimum.

## 3. Components

Library approved by Arjun (17 Oct): **Radix Popover** for the command bar with our own list, no cmdk. Tabs, Select, Popover and Tooltip come from Radix primitives too, styled with the tokens. Everything else is ours.

| Component | Variants | States | Notes |
| --- | --- | --- | --- |
| Button | primary (brass fill, on-brass text), ghost (brass/text, 1px border/line), destructive (ox/fill, white); sizes md 44px, sm 36px | default, hover (lift 1px + 4px brass/soft halo), focus, disabled (opacity .5), loading (spinner replaces label, width held) | Label Mukta 500 15px. Never two primaries on one screen. |
| Input, Textarea | default, with label, with help, with error | default, focus (bottom border brass/fill 2px), error (error/text border + message), disabled | Underline style on the folio; boxed style (1px border/line, radius md) in Settings forms. |
| Chip | neutral, brass, ok, warn, error | static | 12px label, pill radius, 4px 10px padding. Ink chip: brass dot + "32 Ink". |
| Card | plain, KPI, folio | loading (skeleton), empty, error | 1px border/line, bg/card, padding space/4; KPI number h2 tabular. |
| Command bar | collapsed (input + Ctrl K hint + Draft button), open (Radix Popover list) | focus, typing, results, no results | Label "What do you need to draft?". Quick chips below: Bail application, Legal notice, Written statement, Plaint, Browse all templates. |
| Inkwell | balance 0-100% | draining (generate), static | SVG, 52x64, level rect clipped; `brass/fill` at .85 opacity. |
| Seal | draft ready, finalised | hidden, stamping, stamped | 100x100 SVG, brass fill, on-brass text. |
| Spine | draft (two brass bands), finalised (seal mark), loading, empty, error | hover pulled out 14px | 52x184-210px, label vertical, title attribute carries matter and status. |
| Top bar | signed out, signed in | - | Lawie mark with lamp dot, nav, Ink chip, theme toggle, avatar menu. Collapses to mark + Ink chip + menu at 720px. |
| Toast | info, success, error | auto dismiss 6s, error stays | Bottom on mobile, bottom right on desktop. |
| Dialog, Bottom sheet | confirm, destructive | - | Dialog on desktop, bottom sheet at 360 (T-005 rule). |
| Banner | AI down, payment failed, verify email, privacy re-accept | dismissible or not | Full width under top bar, warn/soft or error/soft. |
| Empty state | per screen | - | One sentence, one primary action, no illustration in V1. |

## 4. Screens

Order follows the brief. Each screen has a Desktop 1280 and a 360 frame in Figma, named `NN Screen / 1280` and `NN Screen / 360`. Every screen specifies loading, empty and error. No dead buttons: every control listed does the thing named.

### 01 Landing

Job: an advocate starts a free draft in under a minute. One primary button, "Start a free draft", repeated in the top bar, hero, after the steps, after prices, and in the final call.

Sections, in order: top bar; hero (display headline left, live demo folio right; stacked at 360 with the folio first after the headline); three steps (Describe, Draft, Review); document types (spines on a shelf: Bail application, Legal notice, Written statement, Plaint, Affidavit, Reply; horizontally scrollable at 360); Ink and prices (Free ₹0 with 5 Ink, Solo ₹799 a month 50 Ink a month, Pro ₹1,999 a month 150 Ink a month; "Prices include GST"; "A failed draft does not use Ink"; yearly hidden); trust (three short paragraphs: the advocate stays responsible, the checks panel, privacy with the policy link and the grievance officer line); FAQ (6 questions, accordion, one open); final call to action; footer with Ajay's disclaimer line, Privacy, Terms, Refunds, Grievance officer, "Case diary and reminders: coming".

Live demo: runs on load, loops with Replay. On slow connections (`navigator.connection.saveData` or effectiveType 2g/3g) the demo starts in its end state and plays only on Replay. Hindi toggle in the top bar swaps every string; the demo text has a Hindi version.

Performance: no images above the fold, two font files, CSS effects only; LCP target under 2.5s on a 3G profile.

States: the demo has no error state (it is scripted). FAQ and prices are static. If the plan list is fetched, show the three plans as skeleton cards for up to 2s, then static fallback copy.

### 02 Sign-up and Login

One page, two tabs (Radix Tabs): "Create account" and "Sign in". The folio holds the form; the lamp pool sits on it. Fields: email, password (show/hide), on sign-up also name and the privacy and terms acceptance with version and date (Ajay). Primary button "Create account" / "Sign in". Links: "Forgot password" (existing flow, T-221), "Verify email" page unchanged in function, reskinned.

States: loading (button spinner, fields disabled); error inline under the field (wrong password, email taken, weak password) and a banner for server errors ("Could not sign you in. Try again." with Retry); empty is the default form. After sign-up the next screen is the Dashboard with the first-draft empty state.

### 03 Dashboard

"Your shelf". Top bar; date line; command bar; KPI grid; shelf; next-step card.

KPIs (checklist order, no time-saved tile): 1 Ink balance (inkwell + number, low-balance nudge below 3 Ink in warn), 2 Recent documents (the shelf), 3 Drafts this month, 4 Draft / finalised, 5 Plan and renewal date, 6 Ink used this month (meter), 7 Drafts by type (three bars). Grid: 2 columns at 360, 4 at 900+, Ink spans 2.

Data: T-506 summary endpoint. Until it ships, tiles 3, 4, 6, 7 render the skeleton, never a zero.

States: loading, skeleton tiles and three skeleton spines; empty, "The shelf is empty" with "Start your first draft"; error, "Could not load your shelf. Your connection looks slow." with Retry, tiles keep their last values if any.

### 04 Describe-first intake

T-005 flow unchanged (01 Describe to 08 No match), restyled as the folio. Screen 01 is the command bar expanded: textarea on the folio, "Draft" primary, "Browse templates" link, Ink cost line before generate. Follow-up (02) is a short list of questions on the same folio. Review details (03) uses boxed inputs. Length and estimate (04) shows the inkwell with the cost. Generating (05) is the ink drain with the three steps. Low balance (07) is a dialog, bottom sheet at 360, with "Top up" primary.

States: loading on each step is the folio with a skeleton; error, "Could not read your description. Try again." with Retry and the text kept; empty, the placeholder "A bail application for a client arrested on Tuesday…".

### 05 Editor and draft ready

Draft ready (06) is the folio with the written draft, the chips "1 Ink used" and "Checks: N items", and the buttons Finalise (primary), Regenerate (ghost, confirm dialog), Export. The checks panel is a right rail at 1280 and a bottom sheet at 360, listing items to review; each item scrolls to its paragraph. Finalise stamps the seal, locks the draft and shows Export PDF / Word. Editor: the same folio, contenteditable paragraphs, a floating toolbar (bold, italic, list, heading) at the top of the viewport, section finder in the rail.

States: loading, folio skeleton with the inkwell; error (generation failed), "The draft did not finish. You were not charged." with Try again; empty does not exist (a draft always has content); export error toast with Retry.

### 06 Plan chooser (T-509)

In Settings, "Plan" tab. Three plan cards (Free, Solo highlighted if current, Pro), each with name, price, "N Ink a month", a Choose button that opens Razorpay; the current plan shows "Current plan" and the status card instead. Status card: plan, renews on, state (active / lapsed / payment failed), Cancel (ghost, confirm dialog: "Your plan ends on {date}. Ink you already have stays until then."). Switching: cancel at cycle end, then buy (Arjun). Yearly hidden. Top-up modal: plans list loading skeleton, error with Retry (never a forever spinner).

Gates: unverified email or un-accepted privacy show a banner with the fix ("Verify your email to subscribe" with Resend), never "Order creation failed". After payment: Ink shows "pending" until the webhook lands, then updates.

States: loading, skeleton cards; error, "Could not load plans" with Retry; payment failed, error banner with Retry payment.

### 07 Settings and Profile

Tabs: Profile, Plan, Privacy, Account. Profile fields (T-507): name, phone, enrollment number, bar council, state, practice areas, years, courts practised in, default court. Save is a real PATCH /me with a success toast. Account: change password, active sessions with sign out, close account (existing dialog). Privacy: notice version and date, consent history, withdraw consent, request access / correction / erasure, grievance officer contact with response time, vendor list (Ajay). Theme: Night / Daylight / System.

States: loading skeleton rows; error banner with Retry; empty sessions list "Only this device is signed in".

### 08 Error, loading and empty (T-510)

App-level: 404 (folio with "This page is not on the shelf", Back to dashboard), 500 ("Something went wrong on our side. Your drafts are safe." with Retry and Back), offline banner, AI-down banner ("Drafting is paused. Your documents are still here."). Every list and modal: skeleton, one-sentence empty with one action, error with Retry. Loading longer than 8s shows "Still working…" under the skeleton.

## 5. Mobile behaviour, 360 first

Gutter 16px. One column below 640; two below 900; the 12-column grid at 1280 with a 1180px max width. Top bar collapses to mark, Ink chip and menu. Dialogs become bottom sheets. The checks panel becomes a bottom sheet. The shelf scrolls horizontally with 6px gaps and a visible shelf edge. Touch targets 44px. No hover-only affordances: spine status is in the label too.

## 6. What the build needs before it starts

- T-506 (summary endpoint), T-507 (profile fields), T-508 (cancel and status) for real data; everything renders its loading state until then.
- Arjun: confirm Radix Popover, Tabs, Select, Tooltip; `next/font` setup for Mukta and Tiro.
- Meera and Madhuri: final copy for every string above; Ajay signs.
- Priya: default theme decision (follow system is the spec).

## 7. Not in V1

Photo intake copy, yearly plans, matter folders, hearing reminders, time-saved tile, letterhead, signature, 2FA, data export, notification preferences.
