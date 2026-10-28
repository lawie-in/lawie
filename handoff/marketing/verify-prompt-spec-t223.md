# Handoff spec: "verify your email" prompt (T-223, option B)

Owner: Rajesh. For the lead building T-223. Copy: `handoff/marketing/copy/verify-email-t223.md` (Madhuri; not in the folder when I wrote this, so I list the keys I need below; use her key names where they differ, and do not write strings in code that are not in her file). No code in this spec.

## 0. Scope, from the ticket (Arjun's AC shape, items 1 to 4; the ticket has no numbered AC yet)

- Google sign-in counts as verified, no prompt. Email/password accounts are unverified until they click the link (signed, single-use, 24 h expiry).
- An unverified user gets the first draft. The second draft and Razorpay checkout are refused (~~the daily login bonus~~ withdrawn, AJ-646-M9b) with a "verify your email" prompt plus a resend button (resend is rate-limited).
- Trigger (2), per Priya's decision: since T-351 an unverified email user has 0 Ink, so when the Ink refusal hits an unverified email user the web app shows this verify modal instead of the paywall. Verified users (including Google) still get the paywall. No new error code: the web app decides from the refusal plus the user's verified flag.

## 1. Component per place

| Place | Component | Why |
| --- | --- | --- |
| 1. Sign-in (email/password user, still unverified) | **Banner**, full width under the top bar on every dashboard page, until verified. Dismissible for the session only; returns on next load. | It must not block the first draft, which stays free of friction. |
| 2. Draft refused for Ink, user unverified (email) | **Modal** (Radix Dialog, shadcn Dialog). Opens from the refusal, over the intake or draft screen. | The user's action was just stopped; they need the reason and the one next step. The entered matter must be kept behind it. |
| 3. Checkout (Razorpay, plan or top-up) | **Inline card** in place of the pay button, plan summary left visible above it. Pay is not rendered while unverified. | The user is already on a page about paying; a modal would hide the plan they chose. |
| ~~Daily bonus~~ | ~~No UI of its own: the bonus is simply not granted.~~ Withdrawn, AJ-646-M9b: the daily login bonus was never a real offer, so there is nothing to grant or to refuse. | |

One shared **VerifyPrompt** core (masked address, resend, status, error) drops into all three, so the states below are built once.

## 2. Layout

| Place | 375 px | 1280 px |
| --- | --- | --- |
| Banner | 16 px side gutter. Text block above, button below it full width (min 48 px high). Icon 24 px left of text. Dismiss target 44 x 44 top-right. | Max width of the content column (720 px), one row: icon, text, button on the right. |
| Modal | Centred, 16 px gutter, full width minus gutters, max height 90 vh with scroll. Buttons stacked, full width. Close 44 x 44 top-right. | Max width 480 px, centred. Primary button right, secondary left, inline. |
| Inline card | Full width of the column, 16 px padding, buttons stacked. | Column width (720 px), 24 px padding, buttons inline. |

- Order inside the core, top to bottom: title, one-line reason, masked address, resend button, status line (sent, countdown, error). The status line sits directly under the button, never far from it.
- All targets 44 px or more (use `min-h-[44px]`, the primary 48 px as in `ui.ts`). 8 px minimum between targets.
- No illustrations. One lucide `mail` icon (24 px), navy. Do not use the Paywall's red gradient or `ShieldAlert`: this is not an alarm.

## 3. Tokens and components to reuse

- Tokens, `tailwind.config.js` and `design-notes.md` §2: `brand-navy`, `brand-page`, `brand-line`, `brand-muted`, `brand-gold-light` / `brand-gold-dark` (banner and info), `brand-teal-light` / `brand-teal-dark` (success), `brand-error` / `brand-error-light` (error). Lora 600 only for the modal title; Inter elsewhere.
- Classes from `apps/web/src/components/intake/ui.ts`: `card`, `primaryButton`, `secondaryButton`, `linkButton`, `tagGold`, `tagTeal`, `tagError`, `small`. Button focus ring (`focus-visible:ring-brand-teal`) is already right.
- Reuse the structure of `PaywallModal` (open/close, backdrop) only as a pattern. It has no `role="dialog"` and no focus handling, and it is off-palette; build the new modal on Radix Dialog (shadcn) and leave `PaywallModal` alone.
- Mount point for the banner: the dashboard `layout.tsx`, under `HeaderCreditPill`'s top bar. Checkout card: the existing payment page (`app/dashboard/payment`) and `TopUpModal` (where a top-up starts, show the card instead of the pay step).

## 4. Focus and aria

- Modal: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` the title, `aria-describedby` the reason. Focus moves to the title on open (or the primary button if there is no title), is trapped, Escape closes, and focus returns to the control that triggered it (the Generate button).
- Banner: `role="region"` with `aria-label` from copy. Not auto-focused. Dismiss button has an `aria-label`.
- Inline card: `role="region"`, `aria-labelledby` its title.
- **One live region** per core, `role="status"` `aria-live="polite"` `aria-atomic="true"`, always present in the DOM (empty until used). Sent, success, already-verified and countdown start go in it. Errors (network, link expired, limit hit) go in a separate `role="alert"` node.
- Countdown: announce once when it starts and once when the button becomes available again. Never announce each second (visual countdown has `aria-hidden="true"`; the live region says the full-minutes value once).
- Loading button: keep the label, add `aria-busy="true"`, show a spinner with `aria-hidden`. Disabled buttons use `aria-disabled="true"` and stay focusable, so keyboard and screen-reader users still land on them and hear the reason (the status line is tied with `aria-describedby`).
- The masked address is plain text (not a link). Colour is never the only signal: every state has an icon and text.

## 5. Contrast (AA, verify in the final build)

| Pair | Approx. ratio |
| --- | --- |
| Navy on white / page | 15 or more |
| Gold-dark on gold-light (banner) | about 6 |
| Teal-dark on teal-light (success) | about 5 |
| Error on error-light | about 5.5 |
| Muted on white (status text) | about 5.6 |
| Teal-dark link on white | about 6 |

Gold `#C8850E` is never used for text. Focus ring 2 px teal with 2 px offset, visible on every state.

## 6. States

Same core in all three places. String keys are for Madhuri's file; I need one string per key, plus a title and reason per place.

| State | Visual | Controls | Live region | Key |
| --- | --- | --- | --- | --- |
| Default (prompt) | mail icon, title, reason, masked address `a***@example.com` style (first character, stars, domain; never the full address) | Resend: enabled (primary) | none | `verify.title.<place>`, `verify.reason.<place>`, `verify.masked_label` |
| Resend: loading | spinner in button, label kept | Resend `aria-busy`, not clickable | none | `verify.resend` |
| Sent | teal-light status row, check icon | Resend disabled for the cooldown | polite: sent | `verify.sent` |
| Resend limit | gold-light status row with a visible countdown "try again in X" (minutes:seconds) | Resend disabled | polite once at start and once at end | `verify.limit_wait`, `verify.limit_ready` |
| Link expired | error status row | Resend enabled, label may change | alert | `verify.expired` |
| Already verified | teal-light row, no resend | Primary becomes "continue" and returns to the action that was blocked | polite | `verify.already` |
| Success | teal-light row; banner and modal close themselves after the button is pressed, never on a timer | Primary: continue to what the user was doing | polite | `verify.success` |
| Network error | error row, retry in place | Resend enabled | alert | `verify.network_error` |
| Disabled (cooldown or loading) | button at 40% opacity as in `ui.ts`, plus the reason line | not clickable | none | |

Behaviour rules: Resend cooldown and limit come from the server's response (do not hard-code numbers in the UI). Keep the user's draft input behind the modal. After success, return to the blocked action. Do not auto-retry the draft. The verify link opens a landing page with the success, expired or already-verified state (same core, full page at 375 and 1280 px, centred card, max width 480 px).

## 7. Screens the lead must screenshot for the report

Fictional account only, address shown masked, no real names. Each at 375 px and 1280 px unless noted.

1. Banner on the dashboard, unverified email/password user.
2. Modal after an Ink refusal for an unverified email user (default). Also one capture of a verified user hitting the Ink refusal and seeing the paywall, not this modal.
3. Modal states: resend loading, sent, limit with countdown, network error.
4. Checkout inline card on the payment page, and in the top-up flow.
5. Verify landing page: success, link expired, already verified.
6. Google user: no banner, no modal (proof the exemption works).
7. Keyboard pass at 1280 px: focus ring on resend and on the modal's first focus, and a screen-reader or accessibility-tree capture showing the dialog role and the live region text.
8. Contrast check output for the pairs in §5.
