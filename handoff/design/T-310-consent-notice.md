# T-310 — Analytics consent notice (design)

| Field | Value |
| ----- | ----- |
| Ticket | `handoff/tickets/T-310-analytics-consent-before-ga.md` (context: `T-308-privacy-page-says-no-analytics.md`, `T-306-login-tokens-leak-to-analytics.md`) |
| Owner | Rajesh (look and behaviour). Ajay writes and signs every string. Arjun owns the mechanism. Lead builds (web) |
| Where | New `apps/web/src/components/AnalyticsConsent.tsx` (rendered in root `layout.tsx`, per Arjun). Footer link in `components/marketing/SiteFooter.tsx`. Button in `app/(marketing)/privacy/page.tsx` |
| Colours | None new. `brand-*` tokens from `tailwind.config.js` only (the component lives in the root layout, so it must not depend on `marketing.css` variables) |
| Out of scope | The mechanism (storage, GA load/unload, server record), which is Arjun's spec in T-310. Final wording, which is Ajay's |

## 1. Decisions

| # | Decision | Why |
| - | -------- | --- |
| D1 | **Non-modal card fixed to the bottom of the viewport.** No backdrop, no scroll lock, no focus trap | AC1: "does not cover the page". The visitor can read and use the page without answering |
| D2 | **Accept and Decline are the same component**: same size, same colour, same border, same weight. Neither is filled gold, neither is pre-selected | No dark patterns. Gold is the site's CTA colour; giving it to Accept would nudge |
| D3 | **Order: Decline, then Accept** (left to right, and in tab order) | The privacy-preserving option is reached first; nothing pushes toward Accept |
| D4 | **No close "x", no "Later"** | No answer already means no GA. A third control adds a choice that looks like consent but is not. The notice stays until answered (see risk R1) |
| D5 | **Same card for the first ask and for "Cookie settings"** | One pattern to learn and to test. On reopen it also states the current choice |
| D6 | **Hide the floating "Try Lawie free" CTA while the notice is open** | On phones the CTA is a full-width bar at the bottom (`.float-cta`, z 50); the two would stack and cover ~40% of a 667 px screen |

## 2. Layout

### 2a. 375 px (phone, < 640 px)

```
+-------------------------------------+
|  ... page content (scrolls) ...     |
|                                     |
| +---------------------------------+ |  12 px from left, right, bottom
| | Analytics cookies         (h2)  | |  (+ safe-area inset)
| | One or two lines of Ajay's      | |
| | text. Privacy Policy (link)     | |
| |                                 | |
| | [   Decline    ] [   Accept   ] | |  two equal columns, 44 px tall
| +---------------------------------+ |
+-------------------------------------+
```

- Width: viewport minus 24 px. Height: content, target about 150 to 170 px at the default font size. Never more than 40% of the viewport height; if text grows (200% zoom), the text area scrolls inside the card and the buttons stay visible.
- Buttons: a 2-column grid, each 50% wide minus an 8 px gap, 44 px tall.

### 2b. 1280 px (desktop, >= 640 px)

```
+--------------------------------------------------------------+
| site nav                                                     |
|                                                              |
|  ... page content ...                                        |
|                                                              |
| +----------------------------+                               |
| | Analytics cookies          |                               |
| | Text ... Privacy Policy    |                               |
| | [ Decline ] [ Accept ]     |                               |
| +----------------------------+                               |
+--------------------------------------------------------------+
```

- Bottom-left, 24 px from the left and bottom edges, fixed width 400 px. Bottom-left keeps it clear of the bottom-right float CTA at 641 to 900 px (also hidden per D6) and of the sticky nav.
- Buttons sit side by side, each auto width with a minimum of 120 px, both the same width (grid with two equal columns), 40 px tall (44 px on touch, see classes).

### 2c. Layering

| Layer | z-index | Note |
| ----- | ------- | ---- |
| Logo splash | 9999 | Covers the notice during the first-visit animation; the notice is underneath and appears when the splash fades. No change needed |
| Mobile nav drawer / overlay | 80 / 70 | Covers the notice when open. Correct: the drawer is the visitor's active task |
| Sticky nav | 60 | Top of screen, no overlap |
| **Consent notice** | **55** | |
| Float CTA | 50 | Hidden while the notice is open (D6) |

## 3. Classes (Tailwind, existing tokens only)

```tsx
{/* Container: a landmark, not a dialog */}
<section
  aria-labelledby="consent-title"
  aria-describedby="consent-desc"
  className="fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-[55]
             max-h-[40vh] overflow-y-auto
             rounded-xl border border-brand-line bg-white p-4 text-brand-navy
             shadow-[0_12px_32px_rgba(13,31,60,0.14)]
             sm:inset-x-auto sm:left-6 sm:bottom-6 sm:w-[400px] sm:max-h-none sm:p-5
             motion-safe:animate-[consent-in_200ms_ease-out]"
>
  <h2 id="consent-title" tabIndex={-1}
      className="font-heading text-base font-semibold leading-snug focus:outline-none">
    {/* S1 */}
  </h2>

  <p id="consent-desc" className="mt-1.5 text-sm leading-relaxed text-brand-muted">
    {/* S2 */}{' '}
    <a href="/privacy#browser-storage"
       className="font-medium text-brand-navy underline underline-offset-2
                  hover:text-brand-teal-dark focus-visible:outline-none
                  focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2 rounded-sm">
      {/* S3 */}
    </a>
  </p>

  {/* Only when reopened from "Cookie settings" and a choice exists */}
  <p className="mt-2 text-sm text-brand-navy">{/* S4 */}</p>

  <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4">
    <button type="button" onClick={decline} className={choiceBtn}>{/* S5 Decline */}</button>
    <button type="button" onClick={accept}  className={choiceBtn}>{/* S6 Accept */}</button>
  </div>
</section>

{/* Polite announcement after a choice; always in the DOM, visually hidden */}
<div role="status" aria-live="polite" className="sr-only">{announcement /* S7 or S8 */}</div>
```

One class string for **both** buttons (D2). Do not add a variant prop.

```ts
const choiceBtn =
  'inline-flex h-11 items-center justify-center rounded-lg border-2 border-brand-navy bg-white ' +
  'px-4 text-[15px] font-semibold text-brand-navy ' +
  'hover:bg-brand-page active:bg-brand-line ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2 ' +
  'sm:h-10 sm:min-w-[120px] [@media(pointer:coarse)]:sm:h-11';
```

Keyframe (add to `tailwind.config.js` `extend.keyframes`, or a plain CSS keyframe): `consent-in` = from `opacity: 0; transform: translateY(8px)` to `opacity: 1; transform: none`. No exit animation; it simply unmounts. `motion-safe:` means no movement under `prefers-reduced-motion`.

### Contrast (WCAG AA)

| Pair | Ratio | Need |
| ---- | ----- | ---- |
| `brand-navy` #0D1F3C on white (title, buttons, link) | 16.5:1 | 4.5:1 |
| `brand-muted` #566580 on white (body text) | 5.9:1 | 4.5:1 |
| `brand-navy` border on white (button edge) | 16.5:1 | 3:1 |
| `brand-teal` #0D9488 focus ring on white | 3.7:1 | 3:1 |
| `brand-line` #DCD6C8 card border on white | decorative; the card is also separated by its shadow | n/a |

### Footer link ("Cookie settings")

In `SiteFooter.tsx`, **Legal** column, last item after "Refund Policy". It is a `<button>` (it opens something, it does not navigate), styled to match the column's links.

```tsx
<li>
  <button type="button" onClick={openConsentSettings} aria-haspopup="true"
    className="bg-transparent p-0 text-left text-[15px] text-white/[0.72] transition-colors
               hover:text-[#E5A933] focus-visible:outline-none focus-visible:ring-2
               focus-visible:ring-brand-teal focus-visible:ring-offset-2 focus-visible:ring-offset-brand-navy rounded-sm">
    {/* S9 */}
  </button>
</li>
```

`text-white/[0.72]` and `#E5A933` are the existing `--on-dark-2` and `--gold-light` values from `marketing.css`, so it looks identical to its neighbours.

### Privacy page button

In `privacy/page.tsx`, inside `<section id="browser-storage">` (or the analytics section Ajay adds under T-308), after the analytics paragraph: `<button type="button" className="btn btn-ghost btn-sm" onClick={openConsentSettings}>{/* S10 */}</button>`. Existing marketing button class, so no new style. The page is a server component today; the button is a small client component.

## 4. Behaviour

| State | What the visitor sees | Focus | Screen reader |
| ----- | --------------------- | ----- | ------------- |
| Public page, no valid choice (none, old version, older than 12 months, or storage blocked) | Card appears after mount; page fully usable | **Not moved.** Focus stays where the visitor is; we do not steal focus on page load | The card is a labelled region ("Analytics cookies"). It is the first thing in the DOM (see Focus order), so it is the first thing read and tabbed to |
| Non-public path (`/login`, `/dashboard/*`, ...) | Nothing. Uses T-306's allowlist constant | n/a | n/a |
| Visitor ignores it and navigates to another public page | Card shows again on the next page. No GA in the meantime | Not moved | Same |
| **Decline** | Card closes at once. Nothing else changes on the page | Moves to `<main>` (give it `id="main" tabIndex={-1}`) so keyboard users are not dropped to the top of `<body>` | Status: S8 |
| **Accept** | Card closes at once. Nothing visible changes (GA loads in the background) | Same as Decline | Status: S7 |
| Footer "Cookie settings" or privacy-page button | Same card reopens in place, with S4 showing the current choice. Both buttons still look identical; the current choice is **not** highlighted as selected | Moves to the card's `<h2>` (`tabIndex={-1}`), so the visitor lands on the notice | Reads the heading, then S4 |
| Reopened, then Esc | Card closes, choice unchanged | Back to the button that opened it | Nothing announced |
| Reopened, then a choice | Saved and applied without reload (Arjun) | Back to the button that opened it | S7 or S8 |
| First ask, then Esc | Nothing. There is no "dismiss" on the first ask (D4) | n/a | n/a |
| Server record fails | Nothing shown, ever (Arjun) | n/a | n/a |

Hiding the float CTA (D6): while the notice is mounted, set `data-consent-open` on `<body>`; in `marketing.css` add `body[data-consent-open] .float-cta { display: none; }`. Remove the attribute when the card closes.

### Focus order

Render the card as the **first child of `<body>`** content (before the site nav), even though it is fixed at the bottom visually. Tab order inside it:

1. "Privacy Policy" link (S3)
2. Decline (S5)
3. Accept (S6)

Then the page continues (nav, content, footer). Rationale: a keyboard or screen-reader user meets the question first instead of after 40+ footer links. This is the one deliberate mismatch between visual and DOM order; it is acceptable because the card is self-contained and labelled.

All three controls are native elements (`<a>`, `<button>`), so Enter and Space work without extra code. No `role="dialog"`, no `aria-modal`: it is not modal.

### Accessible names

| Element | Name | Source |
| ------- | ---- | ------ |
| Card | S1 (via `aria-labelledby`), description S2 | visible text |
| Decline / Accept | S5 / S6 | visible text. No `aria-label` override; the visible word is the name (WCAG 2.5.3) |
| Privacy link | S3 | visible text |
| Footer button | S9 | visible text |
| Privacy-page button | S10 | visible text |

## 5. Strings — DRAFT, for Ajay to sign

I do not write copy; these are placeholders sized to the layout so Ajay has a length budget. **Ajay replaces and signs all of them.** Constraints from the ticket: do not say that no IP address is processed (Arjun's note: hosting access logs keep IPs, and Google derives location from the IP); do not say "no cookies" (GA sets `_ga`, `_ga_ZSMN1GPPB5` on Accept); Accept and Decline wording must be equally neutral.

| Id | Where | Draft (for Ajay to sign) | Max length |
| -- | ----- | ------------------------ | ---------- |
| S1 | Title | Analytics cookies | 30 chars |
| S2 | Body | With your permission we use Google Analytics to see which public pages are visited. It sets cookies and sends page details to Google. Nothing loads unless you accept. | 200 chars (keeps the phone card under 170 px) |
| S3 | Link | Privacy Policy | 20 chars |
| S4 | Current choice (reopen only) | Your current choice: Accepted. / Your current choice: Declined. | 40 chars |
| S5 | Button | Decline | 12 chars; must be as plain as S6 |
| S6 | Button | Accept | 12 chars |
| S7 | Status after Accept | Choice saved. Analytics is on. | 50 chars |
| S8 | Status after Decline | Choice saved. Analytics is off. | 50 chars |
| S9 | Footer | Cookie settings | 20 chars |
| S10 | Privacy page button | Change cookie settings | 30 chars |

Hindi strings: not in this ticket; the card's text area scrolls if a later Devanagari version runs longer.

## 6. Checks at 375 and 1280 px (for the lead's recorded browser check and Anushka)

1. Fresh profile, `/`: card visible bottom (375) / bottom-left (1280); page scrolls and links work behind it; no float CTA bar on top of it at 375.
2. Both buttons are the same size and colour at both widths; nothing pre-selected.
3. Tab from the address bar: Privacy Policy, Decline, Accept, then the nav.
4. Decline: card gone, focus on main content; next public page has no card.
5. Footer "Cookie settings": card back, shows "current choice", focus on its title; Esc closes and returns focus to the footer button.
6. `/login` and `/dashboard`: no card.
7. 200% browser zoom at 375: buttons stay visible; text scrolls inside the card.

## 7. UX risks

| # | Risk | Owner | Proposal |
| - | ---- | ----- | -------- |
| R1 | A visitor who never answers sees the card on every public page (~160 px of a phone screen). It is the price of D4 | Priya | Accept for v1. If drop-off shows on mobile, revisit with Ajay (e.g. remember "no answer" for the session), not by adding a nudging close button |
| R2 | `LogoSplash.tsx` loads the Fraunces font from `fonts.googleapis.com` on first visit, before any consent. That is a request to Google (with the visitor's IP) that the notice does not cover | Arjun, Ajay | Self-host the font or drop it; at minimum Ajay's privacy wording must not say nothing goes to Google before consent |
| R3 | The privacy page section is titled "Browser Storage (no cookies)" today; after Accept, GA sets cookies | Ajay (T-308) | Retitle when he signs the T-308 text; the S3 link target `#browser-storage` should point at whichever section he puts analytics in |
| R4 | Splash (z 9999) sits over the card on first visit; screen readers may reach the card while the splash is still visible | Lead | Minor. If the splash is not `aria-hidden`, mount the card after `lawie_splash_seen` is set or after the splash ends |
