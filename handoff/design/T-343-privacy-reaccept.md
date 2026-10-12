# T-343 — Privacy re-acceptance prompt (design)

| Field                 | Value                                                                                                                                                                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ticket                | `handoff/tickets/T-343-privacy-reacceptance.md`                                                                                                                                                                                                                                |
| Signed text and rules | `handoff/legal/T-343-privacy-reaccept-signed.md` (Ajay, 12 Oct 2026). P1–P7 are used **byte for byte**; this spec only says where they go                                                                                                                                      |
| Owner                 | Rajesh (look and behaviour). Ajay (every string, and the rules). Lead (auth, web) builds                                                                                                                                                                                       |
| Where                 | New `apps/web/src/components/PrivacyReacceptDialog.tsx`, mounted once in `apps/web/src/app/dashboard/layout.tsx` (every signed-in `/dashboard/*` page, including `/dashboard/payment/success`). Not on `/admin` (own layout), not on marketing pages, not on `/review/[token]` |
| Pattern               | House dialog: `@radix-ui/react-dialog`, as `components/editor/ExportBlanksDialog.tsx` (bottom sheet on phones, centred from `sm:`). Button classes from `components/intake/ui.ts`                                                                                              |
| Colours               | None new. `brand-*` tokens from `tailwind.config.js` only                                                                                                                                                                                                                      |
| Out of scope          | The mechanism (version check, per-sign-in flag, routes, history), which is the lead's and Ajay's §3–§4. All wording, which is Ajay's                                                                                                                                           |

## 1. Decisions

| #   | Decision                                                                                                                                                                                                                  | Why                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | **Modal dialog** (Radix `Dialog`, overlay, focus trap, scroll lock). Not T-310's non-modal card                                                                                                                           | The user is asked a question that gates two actions; a modal makes sure it is seen once per sign-in and is answered or dismissed on purpose. "Not now" is one tap away, so the modal never traps anyone                                                                                                                                                                                    |
| D2  | **Accept is the primary (navy fill), Not now is the secondary (navy outline). Same height, same width, same font size and weight.** Neither is gold                                                                       | Ajay's table names P5 "Primary" and P6 "Secondary". Unlike T-310 (consent to optional analytics, where equal look was required), here accepting is the user's normal next step and "Not now" costs nothing (no sign-out, nothing recorded). The two still have equal **size**, so "Not now" is never small, faint or a text link. No gold: gold is the marketing CTA colour and would push |
| D3  | **Order: Not now, then Accept and continue.** Same order in the DOM, in tab order and on screen at both widths. Phone: stacked, Not now on top, Accept below. Desktop: one row, right-aligned, Not now left, Accept right | The no-commitment option is reached first (as T-310 D3). Visual order = DOM order, so no `flex-col-reverse` mismatch. On a phone, Accept sits lowest, in thumb reach, without needing to come first                                                                                                                                                                                        |
| D4  | **Initial focus on the title**, not on a button                                                                                                                                                                           | A stray Enter (or a double-tap carried over from the sign-in button) must not accept a policy. Screen readers read title, then description                                                                                                                                                                                                                                                 |
| D5  | **Esc = Not now.** Overlay tap/click does **nothing**                                                                                                                                                                     | Esc is the keyboard "get me out" (WCAG 2.1.2 no keyboard trap). An overlay tap on a phone is too easy to do by accident; it would read as a decision the user did not make                                                                                                                                                                                                                 |
| D6  | **No close "x"**                                                                                                                                                                                                          | "Not now" already is the close. A third control would be an unlabelled duplicate needing a new string                                                                                                                                                                                                                                                                                      |
| D7  | **No sign-out button in the prompt.** Sign-out stays reachable through Not now, then the Sidebar logout                                                                                                                   | Adding it needs a new signed string. "Not now" never signs out and is one action, so the Sidebar logout is always one step away. Checked in §8 item 9                                                                                                                                                                                                                                      |
| D8  | **No prompt without a summary.** The component returns `null` if `summary` is empty, `undefined` or whitespace, even if the server said "show"                                                                            | Ajay §1: no generic fallback. Defence in depth on the client                                                                                                                                                                                                                                                                                                                               |
| D9  | **Blocked actions stay enabled** (not `disabled`). After Not now, P7 shows inline next to the action; pressing the action again reopens the prompt                                                                        | Disabled buttons lose focus and give no reason. Ajay §3: the prompt shows again on each blocked attempt                                                                                                                                                                                                                                                                                    |

## 2. Layout

### 2a. 375 px (phone, < 640 px): bottom sheet

```
+-------------------------------------+
| [overlay: brand-navy/55 over shell] |
|                                     |
| +---------------------------------+ |  full width, rounded top 16 px
| | We have updated our Privacy     | |  P1  (h2, Lora 20/28)
| | Policy                          | |
| |                                 | |
| | {summary}                       | |  P2  (15/24, navy, medium)
| |                                 | |
| | Please read the updated policy. | |  P3  (15/24, navy)
| | You need to accept it to create | |
| | new drafts or make payments.    | |
| |                                 | |
| | Read the Privacy Policy         | |  P4  (link, teal-dark, underline, 44 px tap row)
| | ------------------------------- | |  (text area above scrolls; nothing below does)
| | [           Not now           ] | |  P6  48 px
| | [     Accept and continue     ] | |  P5  48 px
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
|         |       | We have updated our Privacy Policy    |  P1 (Lora 24/32)
|         |       |                                      |      |
|         |       | {summary}                            |  P2
|         |       | Please read the updated policy. You  |  P3
|         |       | need to accept it to create new ...  |      |
|         |       | Read the Privacy Policy              |  P4
|         |       |                                      |      |
|         |       |         [ Not now ] [ Accept and continue ] |  P6, P5
|         |       +--------------------------------------+      |
+--------------------------------------------------------------+
```

- Fixed width 480 px, centred horizontally, top at 14vh (same as ExportBlanksDialog). Padding 28 px (`sm:p-7`), radius 16 px.
- Buttons in one row, right-aligned, 12 px gap. Both buttons the **same width** (a 2-column grid sized to the wider one, min 140 px), 48 px tall.

### 2c. Height, scroll and 200% zoom (all widths)

- The dialog has the height cap and **no** `overflow`. Only the inner text block (P1–P4) has `overflow-y-auto` with `min-h-0`; the button row is `shrink-0`. The buttons are therefore always visible; only text scrolls. (Same rule as T-310 §3.)
- 1280 at 200%: CSS viewport about 640 x 360, so `sm:` applies. Cap `sm:max-h-[80vh]` keeps the dialog inside the window; text scrolls, buttons stay.
- 375 at 200%: CSS viewport about 187 px wide. Button labels **wrap** (`whitespace-normal text-center py-2`, `min-h-[48px]` not fixed `h-`), so "Accept and continue" goes to two lines rather than overflowing. No horizontal scroll anywhere.
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

## 3. Where P1–P7 go

Copy P1–P7 from Ajay's signed file, not from this spec: the wireframes above wrap lines for layout and are not the source text.

| Id  | Element                                   | Markup                                              | Style                                                                                                                           |
| --- | ----------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| P1  | Title                                     | `<Dialog.Title asChild><h2 tabIndex={-1}>`          | `font-heading text-brand-navy text-xl leading-7 font-semibold sm:text-2xl sm:leading-8 focus:outline-none`                      |
| P2  | `{summary}` for the current version       | `<p>`, first paragraph inside `Dialog.Description`  | `text-brand-navy text-[15px] leading-6 font-medium`                                                                             |
| P3  | Fixed body line                           | `<p>`, second paragraph inside `Dialog.Description` | `text-brand-navy text-[15px] leading-6`                                                                                         |
| P4  | Link to `/privacy`                        | `<a href="/privacy">` (Next `Link`), same tab       | `linkButton` from `intake/ui.ts` (teal-dark, underline, 44 px tall)                                                             |
| P5  | Primary button                            | `<button type="button">`                            | `primaryButton` + `w-full sm:w-auto whitespace-normal text-center`                                                              |
| P6  | Secondary button                          | `<button type="button">`                            | `secondaryButton` + `min-h-[48px] text-base` (to match P5's height and size) + `w-full sm:w-auto whitespace-normal text-center` |
| P7  | Inline, at a blocked action after Not now | See §6                                              | See §6                                                                                                                          |

- P2 is rendered as plain text (no HTML, no markdown). It is one line by Ajay's rule; if a later summary runs to 3 or 4 lines on a phone, the text area scrolls (§2c).
- Nothing else is printed in the dialog: no date, no version number, no icon text. A decorative icon is not needed; omit it (keeps the sheet short on a phone).
- P4 opens in the **same tab** (no "opens in a new tab" string exists). Following it counts as the prompt having been shown; the user sees it again at the next blocked action (Ajay §3), which is where they would accept anyway.

## 4. Tokens and classes

```tsx
<Dialog.Root
  open={open}
  onOpenChange={(o) => {
    if (!o) onNotNow();
  }}
>
  <Dialog.Portal>
    <Dialog.Overlay className="bg-brand-navy/55 fixed inset-0 z-[60] motion-safe:animate-[reaccept-fade_150ms_ease-out]" />
    <Dialog.Content
      onOpenAutoFocus={(e) => {
        e.preventDefault();
        titleRef.current?.focus();
      }}
      onPointerDownOutside={(e) => e.preventDefault()} /* D5: overlay does nothing */
      onInteractOutside={(e) => e.preventDefault()}
      onEscapeKeyDown={(e) => {
        if (pending) e.preventDefault();
      }} /* Esc = Not now, except mid-request */
      className="fixed inset-x-0 bottom-0 z-[61] flex max-h-[max(88vh,12rem)] flex-col rounded-t-2xl bg-white p-5 pb-[max(20px,env(safe-area-inset-bottom))] motion-safe:animate-[reaccept-in_200ms_ease-out] sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-[14vh] sm:max-h-[max(80vh,12rem)] sm:w-[480px] sm:-translate-x-1/2 sm:rounded-2xl sm:p-7"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        {/* P1, P2, P3, P4 */}
      </div>
      {/* Accept error slot E1, §5 */}
      <div className="mt-5 grid shrink-0 grid-cols-1 gap-3 sm:auto-cols-fr sm:grid-flow-col sm:justify-end">
        {/* P6 Not now, then P5 Accept */}
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```

| Token                                  | Value                                                                                                          | Used for                                                 |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `brand-navy`                           | #0D1F3C                                                                                                        | Title, body, P5 fill, P6 border and text, overlay at 55% |
| `brand-teal-dark`                      | #0A6F66                                                                                                        | P4 link text                                             |
| `brand-teal`                           | #0D9488                                                                                                        | Focus ring (2 px, 2 px offset) on link and buttons       |
| `brand-gold-light` / `brand-gold-dark` | #FBF1DC / #7A4E00                                                                                              | P7 inline notice background / icon and border            |
| `brand-error-light` / `brand-error`    | #FCE9E7 / #B3261E                                                                                              | Accept error (E1)                                        |
| white                                  | #FFFFFF                                                                                                        | Dialog surface, P6 fill, P5 text                         |
| Radius                                 | 16 px dialog (`rounded-2xl`), 8 px buttons (`rounded-lg`)                                                      |                                                          |
| Spacing                                | 20 px phone / 28 px desktop padding; 12 px between text blocks and between buttons; 20 px above the button row |                                                          |
| Tap targets                            | 48 px buttons, 44 px link row                                                                                  | All >= 44 px                                             |

### Contrast (WCAG AA)

| Pair                                     | Ratio  | Need  |
| ---------------------------------------- | ------ | ----- |
| navy on white (P1, P2, P3, P6)           | 16.4:1 | 4.5:1 |
| white on navy (P5)                       | 16.4:1 | 4.5:1 |
| teal-dark on white (P4)                  | 6.0:1  | 4.5:1 |
| teal focus ring on white                 | 3.7:1  | 3:1   |
| navy on gold-light (P7 text)             | 14.6:1 | 4.5:1 |
| gold-dark on gold-light (P7 icon/border) | 6.4:1  | 3:1   |
| error on error-light (E1)                | 5.6:1  | 4.5:1 |
| navy P6 border on white                  | 16.4:1 | 3:1   |

`brand-muted` is not used for P3: P3 carries the consequence of saying "Not now", so it gets full-strength text.

## 5. Behaviour

| State                                                                                        | What the user sees                                                                                                                                                      | Focus                                                                                                                                   | Screen reader                                                                  |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Sign-in, version behind and a signed summary exists                                          | Shell renders first (not on top of the loading spinner), then the dialog opens over it on whatever `/dashboard` page they land on                                       | Title (D4)                                                                                                                              | Dialog role, name P1, description P2 + P3                                      |
| No signed summary for the version                                                            | Nothing (D8)                                                                                                                                                            | n/a                                                                                                                                     | n/a                                                                            |
| Already shown this sign-in, user moves between pages                                         | Nothing                                                                                                                                                                 | n/a                                                                                                                                     | n/a                                                                            |
| **Not now** (button or Esc)                                                                  | Dialog closes at once. Nothing recorded. User stays on the same page; sidebar, logout, drafts, downloads, export, settings, deletion and support all work               | Back to the element that opened it: on sign-in, `<main>` (give it `id="main" tabIndex={-1}`); on a blocked action, that action's button | Nothing extra; focus landing is the feedback                                   |
| **Accept, pending**                                                                          | P5 keeps its label and shows a 16 px spinner before it; both buttons `aria-disabled="true"` (not `disabled`, so focus stays on P5); Esc ignored                         | Stays on P5                                                                                                                             | `aria-busy="true"` on the dialog                                               |
| **Accept, success**                                                                          | Dialog closes. Any P7 notices on the page disappear. The blocked action is **not** run automatically (it may spend credits or open Razorpay); the user presses it again | Same as Not now (to `<main>` or the action's button)                                                                                    | Nothing extra. If Ajay wants a confirmation, it needs a new signed string (Q2) |
| **Accept, error** (network or 5xx)                                                           | Dialog stays open. Error E1 appears directly above the buttons; both buttons enabled again; the user can retry or choose Not now                                        | Back to P5                                                                                                                              | E1 is `role="alert"` (read once)                                               |
| Blocked action, not accepted, prompt not open                                                | Dialog opens again (Ajay §3)                                                                                                                                            | Title                                                                                                                                   | As on sign-in                                                                  |
| Blocked action, then Not now                                                                 | Dialog closes; **P7 inline** next to the action (§6)                                                                                                                    | Back to the action's button, which has `aria-describedby` → P7                                                                          | P7 read with the button                                                        |
| Server returns P7 although the client thought the user was fine (version bumped mid-session) | Same as the line above: dialog opens, then P7 inline if Not now                                                                                                         | Same                                                                                                                                    | Same                                                                           |

**E1 (Accept error) — string missing.** P1–P7 have no error line. I do not write copy and the lead must not invent one. Budget: one sentence, 70 chars. Until Ajay (or Madhuri, for Ajay to sign) supplies it, this is open (Q1).

## 6. Inline P7 at a blocked action

Where it appears: next to the control that tried to generate or pay. Today that means the generate control on `/dashboard/new` (and any other generate entry point the lead finds), and the pay buttons in `PaywallModal`, `TopUpModal` and `/dashboard/settings`.

```
 +------------------------------------------+
 | (i)  Accept the updated Privacy Policy   |   P7, gold-light box, 4 px gold-dark left border
 |      to continue.                        |
 +------------------------------------------+
 [            Generate draft             ]    the action itself, unchanged and still enabled
```

```tsx
<p
  id="reaccept-p7"
  role="status"
  className="bg-brand-gold-light border-brand-gold-dark text-brand-navy flex items-start gap-2 rounded-lg border-l-4 px-3 py-2 text-sm leading-5"
>
  <Info size={16} aria-hidden="true" className="text-brand-gold-dark mt-0.5 shrink-0" />
  {P7}
</p>
```

- Placed **directly above** the action button (above, so the soft keyboard or a sticky bottom bar never hides it), 8 px gap. Full width of the action's container.
- The button keeps its normal look and label; it gets `aria-describedby="reaccept-p7"`. Pressing it again reopens the prompt.
- The notice stays until the user accepts (then it is removed everywhere) or leaves the page.
- Same notice wherever P7 comes back from the server, so client and server blocks look identical.
- No button inside the notice (would need a new string or reuse P5 out of context; Q3).

## 7. Motion

| Element        | Default                                                                                                                    | `prefers-reduced-motion: reduce`                                |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Overlay        | `reaccept-fade`: opacity 0 → 1, 150 ms ease-out                                                                            | None (appears at once)                                          |
| Dialog         | `reaccept-in`: opacity 0 → 1 and `translateY(16px)` → none, 200 ms ease-out (sheet rises on phone, slight lift on desktop) | None                                                            |
| Close          | No exit animation; unmounts                                                                                                | Same                                                            |
| Accept spinner | `motion-safe:animate-spin`                                                                                                 | Static icon; `aria-busy` and the dimmed buttons carry the state |
| P7 notice      | Appears without animation                                                                                                  | Same                                                            |

Keyframes go in `tailwind.config.js` `extend.keyframes` (or plain CSS). Everything uses `motion-safe:` so reduced motion gets no movement.

## 8. Checks at 375 and 1280 px (for the lead's recorded browser check and Anushka)

Set up a user whose stored `privacyVersion` is older than current, with a signed summary for current.

1. Sign in: shell loads, then the prompt opens. 375: bottom sheet, buttons stacked, Not now on top. 1280: centred, 480 px, Not now left of Accept. P1–P4 match Ajay's text exactly.
2. Both buttons are the same height and width at both widths; Accept is navy, Not now is outlined; nothing is gold; nothing is focused except the title.
3. Keyboard only: focus starts on the title; Tab goes Read the Privacy Policy → Not now → Accept and continue → back to the link (trapped inside). Shift+Tab reverses. Enter with focus on the title does nothing.
4. Esc closes it like Not now. Clicking or tapping the overlay does nothing.
5. Not now: prompt gone, focus on main content, nothing else changed. Move to another `/dashboard` page: no prompt.
6. After Not now: open an existing draft, download it, open settings, export data, reach support: all work, no prompt.
7. After Not now: press the generate control: prompt opens again. Not now: P7 appears above the control, focus is back on the control, a screen reader reads P7 with it. Same from a pay button inside the paywall/top-up modal (prompt opens **above** that modal).
8. Accept: prompt closes, P7 notices disappear, generate and pay work on the next press, the prompt does not come back after sign-out and sign-in.
9. Sign-out: from the open prompt, Not now then the sidebar logout (phone: menu, then logout) signs out. Nothing in the prompt blocks it.
10. Accept error (block the request in devtools): prompt stays, E1 shown above the buttons, focus on Accept, retry works.
11. Version with no signed summary: no prompt, generate and pay are not blocked.
12. 200% zoom at 375 and 1280: no horizontal scroll; buttons always visible inside the dialog; only the text scrolls; at 375, button labels wrap instead of overflowing.
13. Screen reader (TalkBack on Android Chrome, NVDA or VoiceOver on desktop): on open it announces a dialog named "We have updated our Privacy Policy" followed by the summary and P3; background content is not reachable.
14. Reduced motion on: dialog appears without sliding or fading; spinner does not spin.
15. A brand-new sign-up: no prompt (records `via: 'signup'`).

## 9. Open questions and UX risks

| #   | Item                                                                                                                                                                                                                                 | Owner                    | Proposal                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | **No signed error string for a failed Accept (E1).** Blocks §5 Accept-error state                                                                                                                                                    | Ajay (Madhuri may draft) | One sentence, <= 70 chars, in the same signed file. Lead does not ship an invented line                                                                           |
| Q2  | No announcement after Accept. Focus moving back is the only feedback                                                                                                                                                                 | Ajay                     | Acceptable for v1. Optional signed status line if Ajay wants one                                                                                                  |
| Q3  | P7 notice has no button to reopen the prompt; the user presses the blocked action again                                                                                                                                              | Ajay                     | Acceptable (the action itself reopens it). If Ajay prefers, allow P5 as a button inside the notice; that is his call because it reuses signed text in a new place |
| R1  | D2 gives Accept the filled style. If Ajay reads DPDP "free consent" as needing T-310-style equal looks, switch P5 to the `secondaryButton` class; no other change                                                                    | Ajay                     | Confirm with Ajay before build                                                                                                                                    |
| R2  | P4 navigates away in the same tab; a user who reads the policy and returns will not see the prompt until a blocked action                                                                                                            | Ajay, Priya              | Fine under "once per sign-in". A new-tab link would need an extra "(opens in a new tab)" string                                                                   |
| R3  | `/dashboard/payment/success` is inside the mount. The prompt could only appear there if the version changed between paying and landing (payment is blocked otherwise)                                                                | Lead                     | No special case; it is a normal page                                                                                                                              |
| R4  | Credit modals (`PaywallModal` etc.) are hand-rolled, not Radix, and have no focus management of their own. The prompt opening above them is handled by Radix's trap; on close, focus must go back to the pay button inside the modal | Lead                     | Pass the trigger element into the prompt and focus it on close (§5)                                                                                               |
