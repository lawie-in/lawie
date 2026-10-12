# T-343 — Privacy re-acceptance prompt (design)

| Field                       | Value                                                                                                                                                                                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ticket                      | `handoff/tickets/T-343-privacy-reacceptance.md`                                                                                                                                                                                                                                |
| Signed text and rules       | `handoff/legal/T-343-privacy-reaccept-signed.md` (Ajay, 12 Oct 2026). P1–P7 are used **byte for byte**; this spec only says where they go                                                                                                                                      |
| Ajay's rulings, 12 Oct 2026 | P8, P9 and the rulings on Q1–Q3, R1, R2 (§9). Relayed by Kunal while Ajay's addendum to the signed file is held by the push freeze. **When the addendum lands, the lead checks P8 and P9 against it byte for byte before shipping; the signed file wins if they differ**       |
| Owner                       | Rajesh (look and behaviour). Ajay (every string, and the rules). Lead (auth, web) builds                                                                                                                                                                                       |
| Where                       | New `apps/web/src/components/PrivacyReacceptDialog.tsx`, mounted once in `apps/web/src/app/dashboard/layout.tsx` (every signed-in `/dashboard/*` page, including `/dashboard/payment/success`). Not on `/admin` (own layout), not on marketing pages, not on `/review/[token]` |
| Pattern                     | House dialog: `@radix-ui/react-dialog`, as `components/editor/ExportBlanksDialog.tsx` (bottom sheet on phones, centred from `sm:`). Button class as T-310's `choiceBtn` (§4)                                                                                                   |
| Colours                     | None new. `brand-*` tokens from `tailwind.config.js` only                                                                                                                                                                                                                      |
| Out of scope                | The mechanism (version check, per-sign-in flag, routes, history), which is the lead's and Ajay's §3–§4. All wording, which is Ajay's                                                                                                                                           |

## 1. Decisions

| #   | Decision                                                                                                                                                                                                                  | Why                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Modal dialog** (Radix `Dialog`, overlay, focus trap, scroll lock). Not T-310's non-modal card                                                                                                                           | The user is asked a question that gates two actions; a modal makes sure it is seen once per sign-in and is answered or dismissed on purpose. "Not now" is one tap away, so the modal never traps anyone |
| D2  | **Accept and Not now are the same component**: same size, same colour (navy outline on white), same border, same weight. Neither is filled, neither is gold, neither is pre-selected                                      | Ajay's ruling (R1): equal, as in T-310. "Primary"/"Secondary" in his table means order only, not emphasis. One class string for both; no variant prop                                                   |
| D3  | **Order: Not now, then Accept and continue.** Same order in the DOM, in tab order and on screen at both widths. Phone: stacked, Not now on top, Accept below. Desktop: one row, right-aligned, Not now left, Accept right | The no-commitment option is reached first (as T-310 D3). Visual order = DOM order, so no `flex-col-reverse` mismatch                                                                                    |
| D4  | **Initial focus on the title**, not on a button                                                                                                                                                                           | A stray Enter (or a double-tap carried over from the sign-in button) must not accept a policy. Screen readers read title, then description                                                              |
| D5  | **Esc = Not now.** Overlay tap/click does **nothing**                                                                                                                                                                     | Esc is the keyboard "get me out" (WCAG 2.1.2 no keyboard trap). An overlay tap on a phone is too easy to do by accident; it would read as a decision the user did not make                              |
| D6  | **No close "x"**                                                                                                                                                                                                          | "Not now" already is the close. A third control would be an unlabelled duplicate needing a new string                                                                                                   |
| D7  | **No sign-out button in the prompt.** Sign-out stays reachable through Not now, then the Sidebar logout                                                                                                                   | Adding it needs a new signed string. "Not now" never signs out and is one action, so the Sidebar logout is always one step away. Checked in §8 item 10                                                  |
| D8  | **No prompt without a summary.** The component returns `null` if `summary` is empty, `undefined` or whitespace, even if the server said "show"                                                                            | Ajay §1: no generic fallback. Defence in depth on the client                                                                                                                                            |
| D9  | **Blocked actions stay enabled** (not `disabled`). After Not now, a P7 box shows next to the action, with its own Accept (P5) and the policy link (P4). Pressing the action again reopens the prompt                      | Disabled buttons lose focus and give no reason. Ajay §3: the prompt shows again on each blocked attempt. Ajay's ruling (Q3): the box gets its own Accept                                                |

## 2. Layout

### 2a. 375 px (phone, < 640 px): bottom sheet

```
+-------------------------------------+
| [overlay: brand-navy/55 over shell] |
|                                     |
| +---------------------------------+ |  full width, rounded top 16 px
| | P1 title                        | |  (h2, Lora 20/28)
| |                                 | |
| | P2 {summary}                    | |  (15/24, navy, medium)
| |                                 | |
| | P3 body line 2                  | |  (15/24, navy)
| |                                 | |
| | P4 link                         | |  (teal-dark, underline, 44 px tap row)
| | ------------------------------- | |  (text area above scrolls; nothing below does)
| | P8 error, only after a failure  | |
| | [           P6 Not now        ] | |  48 px
| | [           P5 Accept         ] | |  48 px, identical style
| +---------------------------------+ |  + safe-area inset at the bottom
+-------------------------------------+
```

- Width 100%. Padding 20 px (`p-5`), bottom padding adds `env(safe-area-inset-bottom)`.
- Height: content, about 330 to 380 px with a one-line summary. Cap `max-h-[88vh]`.
- Buttons: full width, stacked, 12 px gap, 48 px tall each.

### 2b. 1280 px (desktop, >= 640 px): centred dialog

```
+--------------------------------------------------------------+
| sidebar |  top bar                                            |
|         |       +--------------------------------------+      |
|         |       | P1 title                             |  Lora 24/32
|         |       |                                      |      |
|         |       | P2 {summary}                         |      |
|         |       | P3 body line 2                       |      |
|         |       | P4 link                              |      |
|         |       |                                      |      |
|         |       | P8 error (only after a failure)      |      |
|         |       |              [ P6 Not now ] [ P5 Accept ]   |
|         |       +--------------------------------------+      |
+--------------------------------------------------------------+
```

- Fixed width 480 px, centred horizontally, top at 14vh (same as ExportBlanksDialog). Padding 28 px (`sm:p-7`), radius 16 px.
- Buttons in one row, right-aligned, 12 px gap. Both buttons the **same width** (a 2-column grid of equal columns, min 140 px each), 48 px tall.

### 2c. Height, scroll and 200% zoom (all widths)

- The dialog has the height cap and **no** `overflow`. Only the inner text block (P1–P4) has `overflow-y-auto` with `min-h-0`; the P8 slot and the button row are `shrink-0`. The buttons are therefore always visible; only text scrolls. (Same rule as T-310 §3.)
- 1280 at 200%: CSS viewport about 640 x 360, so `sm:` applies. Cap `sm:max-h-[80vh]` keeps the dialog inside the window; text scrolls, buttons stay.
- 375 at 200%: CSS viewport about 187 px wide. Button labels **wrap** (`whitespace-normal text-center py-2`, `min-h-[48px]`, not a fixed `h-`), so "Accept and continue" goes to two lines rather than overflowing. No horizontal scroll anywhere.
- Floor: `max-h-[max(88vh,12rem)]` so at extreme zoom the two buttons plus one text line still fit inside the dialog border.

### 2d. Layering (z-order)

| Layer                                                                                    | z-index         | Note                                                                                                                                                             |
| ---------------------------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Privacy prompt content**                                                               | **z-[61]**      | Must be above everything in the signed-in shell, including credit modals (a payment attempt from inside `PaywallModal` / `TopUpModal` reopens it on top of them) |
| **Privacy prompt overlay**                                                               | **z-[60]**      |                                                                                                                                                                  |
| T-310 consent card                                                                       | 55              | Public pages only, so it should never be on `/dashboard`. If it ever is, the prompt still sits above it                                                          |
| Credit modals (`PaywallModal`, `TopUpModal`, etc.), Radix dialogs (`ExportBlanksDialog`) | 50 (overlay 40) | Under the prompt                                                                                                                                                 |
| SectionFinderPanel                                                                       | 30 / 40         | Under the prompt                                                                                                                                                 |
| Mobile sidebar / its overlay                                                             | 30 / 20         | Under the prompt. After Not now the sidebar (and its logout) is usable                                                                                           |

Do not reuse `z-50` for this dialog: two layers at z-50 would order by DOM position and the prompt could end up under a paywall.

## 3. Where P1–P9 go

Copy P1–P7 from Ajay's signed file and P8–P9 from his addendum once it lands (until then, from the ruling quoted in §9), never from the wireframes: they wrap lines for layout and are not the source text.

| Id  | Element                                     | Markup                                                                                                                            | Style                                                                                                      |
| --- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| P1  | Title                                       | `<Dialog.Title asChild><h2 tabIndex={-1}>`                                                                                        | `font-heading text-brand-navy text-xl leading-7 font-semibold sm:text-2xl sm:leading-8 focus:outline-none` |
| P2  | `{summary}` for the current version         | `<p>`, first paragraph inside `Dialog.Description`                                                                                | `text-brand-navy text-[15px] leading-6 font-medium`                                                        |
| P3  | Fixed body line                             | `<p>`, second paragraph inside `Dialog.Description`                                                                               | `text-brand-navy text-[15px] leading-6`                                                                    |
| P4  | Link to `/privacy` (dialog, and the P7 box) | `<a href="/privacy">` (Next `Link`), same tab                                                                                     | `linkButton` from `intake/ui.ts` (teal-dark, underline, 44 px tall)                                        |
| P5  | Accept (dialog, and the P7 box)             | `<button type="button">`                                                                                                          | `choiceBtn` (§4)                                                                                           |
| P6  | Not now (dialog only)                       | `<button type="button">`                                                                                                          | `choiceBtn` (§4), the same class string as P5                                                              |
| P7  | Box at a blocked action after Not now       | See §6                                                                                                                            | See §6                                                                                                     |
| P8  | Accept error                                | `<p role="alert">` directly above the button row (dialog), or inside the P7 box (§6)                                              | `bg-brand-error-light text-brand-error rounded-lg px-3 py-2 text-sm leading-5`                             |
| P9  | Accept success announcement                 | Text set in a `role="status" aria-live="polite"` region, visually hidden (`sr-only`), always in the DOM in `dashboard/layout.tsx` | Not visible                                                                                                |

- P2 is rendered as plain text (no HTML, no markdown). It is one line by Ajay's rule; if a later summary runs to 3 or 4 lines on a phone, the text area scrolls (§2c).
- Nothing else is printed in the dialog: no date, no version number, no icon text.
- P4 opens in the **same tab** (Ajay's ruling, R2). Following it counts as the prompt having been shown; the user sees it again at the next blocked action (Ajay §3), or uses the Accept in the P7 box.

## 4. Tokens and classes

```tsx
<Dialog.Root open={open} onOpenChange={(o) => { if (!o) onNotNow(); }}>
  <Dialog.Portal>
    <Dialog.Overlay className="bg-brand-navy/55 fixed inset-0 z-[60]
                               motion-safe:animate-[reaccept-fade_150ms_ease-out]" />
    <Dialog.Content
      aria-busy={pending}
      onOpenAutoFocus={(e) => { e.preventDefault(); titleRef.current?.focus(); }}
      onPointerDownOutside={(e) => e.preventDefault()}   /* D5: overlay does nothing */
      onInteractOutside={(e) => e.preventDefault()}
      onEscapeKeyDown={(e) => { if (pending) e.preventDefault(); }}  /* Esc = Not now, except mid-request */
      className="fixed inset-x-0 bottom-0 z-[61] flex max-h-[max(88vh,12rem)] flex-col
                 rounded-t-2xl bg-white p-5 pb-[max(20px,env(safe-area-inset-bottom))]
                 sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-[14vh] sm:max-h-[max(80vh,12rem)]
                 sm:w-[480px] sm:-translate-x-1/2 sm:rounded-2xl sm:p-7
                 motion-safe:animate-[reaccept-in_200ms_ease-out]"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        {/* P1, P2, P3, P4 */}
      </div>
      {error && <p role="alert" className="mt-4 shrink-0 ...P8 classes">{P8}</p>}
      <div className="mt-5 grid shrink-0 grid-cols-1 gap-3 sm:ml-auto sm:grid-cols-2">
        <button type="button" className={choiceBtn} ...>{P6}</button>
        <button type="button" className={choiceBtn} ...>{P5}</button>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```

One class string for **both** buttons (D2, T-310's `choiceBtn` at 48 px). Do not add a variant prop, and do not use `primaryButton` / `secondaryButton` here.

```ts
const choiceBtn =
  'inline-flex min-h-[48px] w-full items-center justify-center whitespace-normal rounded-lg border-2 ' +
  'border-brand-navy bg-white px-4 py-2 text-center text-[15px] font-semibold text-brand-navy ' +
  'hover:bg-brand-page active:bg-brand-line ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2 ' +
  'aria-disabled:cursor-not-allowed aria-disabled:opacity-60 sm:min-w-[140px]';
```

| Token                                  | Value                                                                                                                          | Used for                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `brand-navy`                           | #0D1F3C                                                                                                                        | Title, body, both button borders and labels, overlay at 55% |
| white                                  | #FFFFFF                                                                                                                        | Dialog surface, both button fills                           |
| `brand-page` / `brand-line`            | #FAF8F3 / #DCD6C8                                                                                                              | Button hover / pressed fill (both buttons alike)            |
| `brand-teal-dark`                      | #0A6F66                                                                                                                        | P4 link text                                                |
| `brand-teal`                           | #0D9488                                                                                                                        | Focus ring (2 px, 2 px offset) on link and buttons          |
| `brand-gold-light` / `brand-gold-dark` | #FBF1DC / #7A4E00                                                                                                              | P7 box background / icon and left border                    |
| `brand-error-light` / `brand-error`    | #FCE9E7 / #B3261E                                                                                                              | P8                                                          |
| Radius                                 | 16 px dialog (`rounded-2xl`), 8 px buttons and boxes (`rounded-lg`)                                                            |                                                             |
| Spacing                                | 20 px phone / 28 px desktop padding; 12 px between text blocks and between buttons; 16 px above P8; 20 px above the button row |                                                             |
| Tap targets                            | 48 px buttons, 44 px link row                                                                                                  | All >= 44 px                                                |

### Contrast (WCAG AA)

| Pair                                       | Ratio         | Need  |
| ------------------------------------------ | ------------- | ----- |
| navy on white (P1, P2, P3, both buttons)   | 16.4:1        | 4.5:1 |
| navy button border on white                | 16.4:1        | 3:1   |
| teal-dark on white (P4 in dialog)          | 6.0:1         | 4.5:1 |
| teal-dark on gold-light (P4 in the P7 box) | 5.4:1         | 4.5:1 |
| teal focus ring on white / on gold-light   | 3.7:1 / 3.3:1 | 3:1   |
| navy on gold-light (P7 text)               | 14.6:1        | 4.5:1 |
| gold-dark on gold-light (P7 icon/border)   | 6.4:1         | 3:1   |
| error on error-light (P8)                  | 5.6:1         | 4.5:1 |

`brand-muted` is not used for P3: P3 carries the consequence of saying "Not now", so it gets full-strength text.

## 5. Behaviour

| State                                                                                        | What the user sees                                                                                                                                                         | Focus                                                                                                                                   | Screen reader                                                                                                      |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Sign-in, version behind and a signed summary exists                                          | Shell renders first (not on top of the loading spinner), then the dialog opens over it on whatever `/dashboard` page they land on                                          | Title (D4)                                                                                                                              | Dialog role, name P1, description P2 + P3                                                                          |
| No signed summary for the version                                                            | Nothing (D8)                                                                                                                                                               | n/a                                                                                                                                     | n/a                                                                                                                |
| Already shown this sign-in, user moves between pages                                         | Nothing                                                                                                                                                                    | n/a                                                                                                                                     | n/a                                                                                                                |
| **Not now** (button or Esc)                                                                  | Dialog closes at once. Nothing recorded. User stays on the same page; sidebar, logout, drafts, downloads, export, settings, deletion and support all work                  | Back to the element that opened it: on sign-in, `<main>` (give it `id="main" tabIndex={-1}`); on a blocked action, that action's button | Nothing announced                                                                                                  |
| **Accept, pending**                                                                          | P5 keeps its label and shows a 16 px spinner before it; both buttons `aria-disabled="true"` (not `disabled`, so focus stays on P5); Esc ignored; any earlier P8 is removed | Stays on P5                                                                                                                             | `aria-busy="true"` on the dialog                                                                                   |
| **Accept, success**                                                                          | Dialog closes. Every P7 box on the page disappears. The blocked action is **not** run automatically (it may spend credits or open Razorpay); the user presses it again     | Same as Not now (to `<main>` or the action's button)                                                                                    | P9 in the polite status region. Clear the region's text when the dialog next opens, so a repeat is announced again |
| **Accept, error** (network, 4xx or 5xx)                                                      | Dialog stays open. P8 appears directly above the buttons; both buttons enabled again; the user can retry or choose Not now                                                 | Back to P5                                                                                                                              | P8 is `role="alert"` (read once)                                                                                   |
| Blocked action, not accepted, prompt not open                                                | Dialog opens again (Ajay §3)                                                                                                                                               | Title                                                                                                                                   | As on sign-in                                                                                                      |
| Blocked action, then Not now                                                                 | Dialog closes; **P7 box** above the action (§6)                                                                                                                            | Back to the action's button, which has `aria-describedby` → P7                                                                          | P7 read with the button                                                                                            |
| Server returns P7 although the client thought the user was fine (version bumped mid-session) | Same as the line above: dialog opens, then the P7 box if Not now                                                                                                           | Same                                                                                                                                    | Same                                                                                                               |

Accept uses one handler wherever it is pressed (dialog or P7 box), so pending, P8 and P9 behave the same in both places.

## 6. The P7 box at a blocked action

Where it appears: next to the control that tried to generate or pay. Today that means the generate control on `/dashboard/new` (and any other generate entry point the lead finds), and the pay buttons in `PaywallModal`, `TopUpModal` and `/dashboard/settings`.

375 px (box is the width of the action's container):

```
 +------------------------------------------+
 | (i)  P7 text                             |   gold-light box, 4 px gold-dark left border
 |                                          |
 |      P4 link                             |   44 px row
 |      [           P5 Accept            ]  |   48 px, choiceBtn, full width of the text column
 |      P8 (only after a failed Accept)     |
 +------------------------------------------+
 [            Generate draft             ]      the action itself, unchanged and still enabled
```

> = 640 px:

```
 +--------------------------------------------------------------+
 | (i)  P7 text                                                  |
 |      P4 link                              [ P5 Accept ]       |   one row: link left, button right
 +--------------------------------------------------------------+
```

```tsx
<div className="bg-brand-gold-light border-brand-gold-dark text-brand-navy flex items-start gap-2 rounded-lg border-l-4 px-3 py-3 text-sm leading-5">
  <Info size={16} aria-hidden="true" className="text-brand-gold-dark mt-0.5 shrink-0" />
  <div className="flex min-w-0 flex-1 flex-col gap-2">
    <p id="reaccept-p7" role="status">
      {P7}
    </p>
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <a href="/privacy" className={linkButton}>
        {P4}
      </a>
      <button type="button" className={`${choiceBtn} sm:w-auto`} onClick={accept}>
        {P5}
      </button>
    </div>
    {error && (
      <p role="alert" className="...P8 classes">
        {P8}
      </p>
    )}
  </div>
</div>
```

- Placed **directly above** the action button (above, so the soft keyboard or a sticky bottom bar never hides it), 8 px gap.
- DOM / tab order: P4 link, P5 Accept, then the blocked action. Visual order matches.
- The box has **no** Not now: the user simply ignores it, and it stays until they accept or leave the page.
- The blocked action keeps its normal look and label, gets `aria-describedby="reaccept-p7"`, and pressing it reopens the dialog (Ajay §3).
- Accept in the box: same pending state as the dialog (spinner, `aria-disabled`). Success: the box is removed, P9 is announced, focus moves to the blocked action's button (the box's own button no longer exists). Error: P8 inside the box, focus stays on P5.
- Same box wherever P7 comes back from the server, so client and server blocks look identical.
- Inside `PaywallModal` / `TopUpModal` the box sits above the pay button inside the modal; same classes, no extra z-index.

## 7. Motion

| Element                         | Default                                                                                                                    | `prefers-reduced-motion: reduce`                                                  |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Overlay                         | `reaccept-fade`: opacity 0 → 1, 150 ms ease-out                                                                            | None (appears at once)                                                            |
| Dialog                          | `reaccept-in`: opacity 0 → 1 and `translateY(16px)` → none, 200 ms ease-out (sheet rises on phone, slight lift on desktop) | None                                                                              |
| Close                           | No exit animation; unmounts                                                                                                | Same                                                                              |
| Accept spinner (dialog and box) | `motion-safe:animate-spin`                                                                                                 | Static icon; `aria-busy` / `aria-disabled` and the dimmed buttons carry the state |
| P7 box, P8                      | Appear without animation                                                                                                   | Same                                                                              |

Keyframes go in `tailwind.config.js` `extend.keyframes` (or plain CSS). Everything uses `motion-safe:` so reduced motion gets no movement.

## 8. Checks at 375 and 1280 px (for the lead's recorded browser check and Anushka)

Set up a user whose stored `privacyVersion` is older than current, with a signed summary for current.

1. Sign in: shell loads, then the prompt opens. 375: bottom sheet, buttons stacked, Not now on top. 1280: centred, 480 px, Not now left of Accept. P1–P4 match Ajay's text exactly.
2. Both buttons look identical (same size, white fill, navy outline, same weight) at both widths; nothing is gold or filled; nothing is focused except the title.
3. Keyboard only: focus starts on the title; Tab goes Read the Privacy Policy → Not now → Accept and continue → back to the link (trapped inside). Shift+Tab reverses. Enter with focus on the title does nothing.
4. Esc closes it like Not now. Clicking or tapping the overlay does nothing.
5. Not now: prompt gone, focus on main content, nothing else changed. Move to another `/dashboard` page: no prompt.
6. After Not now: open an existing draft, download it, open settings, export data, reach support: all work, no prompt.
7. After Not now: press the generate control: prompt opens again. Not now: the P7 box appears above the control with the policy link and an Accept button; focus is back on the control; a screen reader reads P7 with it. Same from a pay button inside the paywall/top-up modal (the prompt opens **above** that modal).
8. Accept in the dialog: prompt closes, P7 boxes disappear, a screen reader says P9, generate and pay work on the next press, the prompt does not come back after sign-out and sign-in.
9. Accept from the P7 box (fresh user, Not now first): box disappears, P9 announced, focus on the generate / pay button, which then works.
10. Sign-out: from the open prompt, Not now then the sidebar logout (phone: menu, then logout) signs out. Nothing in the prompt blocks it.
11. Accept error (block the request in devtools), in the dialog and in the box: P8 shown (above the buttons / inside the box), read out once, focus on Accept, retry works.
12. Version with no signed summary: no prompt, no P7 box, generate and pay are not blocked.
13. 200% zoom at 375 and 1280: no horizontal scroll; buttons always visible inside the dialog; only the text scrolls; at 375, button labels wrap instead of overflowing; the P7 box stacks link and button.
14. Screen reader (TalkBack on Android Chrome, NVDA or VoiceOver on desktop): on open it announces a dialog named "We have updated our Privacy Policy" followed by the summary and P3; background content is not reachable.
15. Reduced motion on: dialog appears without sliding or fading; spinner does not spin.
16. A brand-new sign-up: no prompt (records `via: 'signup'`).
17. Once Ajay's addendum is in the signed file: P8 and P9 in the build match it byte for byte.

## 9. Rulings, open items and UX risks

Ajay's rulings (12 Oct 2026, relayed by Kunal; the addendum to the signed file is held by the push freeze):

| #   | Item                         | Ruling                                                                            | Applied in |
| --- | ---------------------------- | --------------------------------------------------------------------------------- | ---------- |
| Q1  | Accept error string          | P8 = `Could not save your acceptance. Please try again.`                          | §3, §5, §6 |
| Q2  | Announce a successful Accept | Yes. P9 = `Privacy Policy accepted.` in a polite live region                      | §3, §5     |
| Q3  | Accept inside the P7 box     | Yes. The box gets its own Accept (P5) with the P4 link next to it                 | §6, D9     |
| R1  | Button emphasis              | Equal, as in T-310: same size and weight. "Primary" in his table meant order only | D2, §4     |
| R2  | Policy link target           | Same tab is fine                                                                  | §3         |

Still open:

| #   | Risk                                                                                                                                                                                                                                 | Owner      | Proposal                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ------------------------------------------------------------------- |
| R3  | `/dashboard/payment/success` is inside the mount. The prompt could only appear there if the version changed between paying and landing (payment is blocked otherwise)                                                                | Lead       | No special case; it is a normal page                                |
| R4  | Credit modals (`PaywallModal` etc.) are hand-rolled, not Radix, and have no focus management of their own. The prompt opening above them is handled by Radix's trap; on close, focus must go back to the pay button inside the modal | Lead       | Pass the trigger element into the prompt and focus it on close (§5) |
| R5  | P8 and P9 are taken from a relayed message, not yet from the signed file                                                                                                                                                             | Lead, Ajay | Check 17 before release                                             |
